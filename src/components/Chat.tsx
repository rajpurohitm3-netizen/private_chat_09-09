"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { motion, AnimatePresence } from "framer-motion";
import { 
    Send, Plus, Camera, Image as ImageIcon, MapPin, 
    Video, Mic, X, Download, Shield, AlertTriangle,
    Eye, EyeOff, Save, Trash2, ShieldCheck, Lock,
    Sparkles, Zap, ChevronLeft, Phone, Check, CheckCheck, ArrowLeft,
    MoreVertical, Trash, Star, Heart, ThumbsUp, Smile, Frown, Meh,
    Volume2, VolumeX, Minimize2, Maximize2, CameraOff, SwitchCamera,
    RefreshCw, Clock, Pause, Square, Map as MapIcon, Play, Paperclip, Share2, MoreHorizontal
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { AvatarDisplay } from "./AvatarDisplay";
import { sendPushNotification } from "@/hooks/usePushNotifications";
import { 
  generateAESKey, encryptWithAES, decryptWithAES, 
  encryptAESKeyForUser, decryptAESKeyWithUserPrivateKey, 
  importPublicKey 
} from "@/lib/crypto";

interface ChatProps {
  session: any;
  privateKey: CryptoKey;
  initialContact: any;
  isPartnerOnline?: boolean;
  onBack?: () => void;
  onInitiateCall: (contact: any, mode: "video" | "voice") => void;
  isFriend?: boolean;
  onSendFriendRequest?: (userId: string) => void;
}

function formatLastSeen(lastSeen: string | null): string {
  if (!lastSeen) return "Offline";
  const date = new Date(lastSeen);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);
  const timeStr = date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
  if (diffMins < 1) return "Last seen just now";
  if (diffMins < 60) return `Last seen ${diffMins}m ago`;
  if (diffHours < 24 && date.getDate() === now.getDate()) return `Last seen today at ${timeStr}`;
  if (diffDays === 1 || (diffHours < 48 && date.getDate() === now.getDate() - 1)) return `Last seen yesterday at ${timeStr}`;
  const dateStr = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return `Last seen ${dateStr} at ${timeStr}`;
}

export function Chat({ session, privateKey, initialContact, isPartnerOnline, onBack, onInitiateCall, isFriend = true, onSendFriendRequest }: ChatProps) {
  const router = useRouter();
  const [messages, setMessages] = useState<any[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [showOptions, setShowOptions] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [contactProfile, setContactProfile] = useState<any>(initialContact);
  const [myPublicKey, setMyPublicKey] = useState<CryptoKey | null>(null);
  const [partnerPresence, setPartnerPresence] = useState<{isOnline: boolean; isInChat: boolean; isTyping: boolean;}>({ isOnline: false, isInChat: false, isTyping: false });
  const [isFocused, setIsFocused] = useState(true);
  const [showSnapshotView, setShowSnapshotView] = useState<any>(null);
  const [showSaveToVault, setShowSaveToVault] = useState<any>(null);
  const [vaultPassword, setVaultPassword] = useState("");
  const [longPressedMessage, setLongPressedMessage] = useState<any>(null);
    const [showMenu, setShowMenu] = useState(false);
    const [showClearConfirm, setShowClearConfirm] = useState(false);
    const [isRecording, setIsRecording] = useState(false);
    const [recordingDuration, setRecordingDuration] = useState(0);
    const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const timerRef = useRef<NodeJS.Timeout | null>(null);
    const [reactionMenuMessage, setReactionMenuMessage] = useState<any>(null);
    const [autoDeleteMode, setAutoDeleteMode] = useState<"none" | "view" | "1h" | "3h">(() => {
    if (typeof window !== "undefined") {
      return (localStorage.getItem(`chatify_auto_delete_${session.user.id}`) as any) || "none";
    }
    return "none";
  });

  useEffect(() => {
    async function refreshContactProfile() {
      try {
        const { data, error } = await supabase.from("profiles").select("*").eq("id", initialContact.id).single();
        if (data && !error) {
          setContactProfile(data);
        }
      } catch (err) {
        console.error("Failed to refresh contact profile:", err);
      }
    }
    refreshContactProfile();
  }, [initialContact.id]);

  useEffect(() => {
    localStorage.setItem(`chatify_auto_delete_${session.user.id}`, autoDeleteMode);
  }, [autoDeleteMode, session.user.id]);

  const [showCamera, setShowCamera] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [cameraFacingMode, setCameraFacingMode] = useState<"user" | "environment">("user");
  
  useEffect(() => {
    if (showCamera && stream && videoRef.current) {
      videoRef.current.srcObject = stream;
      videoRef.current.play().catch(console.error);
    }
  }, [showCamera, stream]);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleBlur = () => setIsFocused(false);
    const handleFocus = () => setIsFocused(true);
    window.addEventListener("blur", handleBlur);
    window.addEventListener("focus", handleFocus);
    return () => {
      window.removeEventListener("blur", handleBlur);
      window.removeEventListener("focus", handleFocus);
    };
  }, []);

    useEffect(() => {
      async function initMyPublicKey() {
        try {
          // Always prefer local public key that matches our current session/device
          const localPubKey = localStorage.getItem(`pub_key_${session.user.id}`);
          if (localPubKey && localPubKey !== "undefined" && localPubKey !== "null") {
            const key = await importPublicKey(localPubKey);
            setMyPublicKey(key);
            
            // Check if server matches local, if not, it's already handled in page.tsx
            // but we can do a secondary check here if needed.
            return;
          }
  
          // Fallback to DB only if local is missing
          const { data } = await supabase.from("profiles").select("public_key").eq("id", session.user.id).single();
          if (data?.public_key) {
            const key = await importPublicKey(data.public_key);
            setMyPublicKey(key);
            localStorage.setItem(`pub_key_${session.user.id}`, data.public_key);
          }
        } catch (err) {
          console.error("Failed to init my public key:", err);
        }
      }
      initMyPublicKey();
    }, [session.user.id]);

    const repairIdentity = async () => {
      const storedPubKey = localStorage.getItem(`pub_key_${session.user.id}`);
      if (!storedPubKey) {
        toast.error("Local identity missing. Please log out and back in.");
        return;
      }
      
      try {
        await supabase.from("profiles").update({ 
          public_key: storedPubKey,
          updated_at: new Date().toISOString()
        }).eq("id", session.user.id);
        toast.success("Security identity synchronized. Future messages will be readable.");
        setTimeout(() => window.location.reload(), 1000);
      } catch (e) {
        toast.error("Repair failed.");
      }
    };

    const decryptMessageContent = async (msg: any) => {
      try {
        if (!msg.encrypted_content) return msg.content || "";
        
        let packet;
        try {
          packet = typeof msg.encrypted_content === 'string' ? JSON.parse(msg.encrypted_content) : msg.encrypted_content;
        } catch (e) {
          return msg.encrypted_content;
        }
  
        if (!packet || !packet.iv || !packet.content || !packet.keys) return msg.encrypted_content;
        
        const userId = session.user.id;
        let encryptedAESKey = packet.keys[userId];
        
        if (!encryptedAESKey) {
          const availableKeys = Object.keys(packet.keys);
          const match = availableKeys.find(k => k.toLowerCase() === userId.toLowerCase());
          if (match) {
            encryptedAESKey = packet.keys[match];
          }
        }
        
        if (!encryptedAESKey) {
          return "🔒 Encrypted signal (key unavailable)";
        }
        
        try {
          const aesKey = await decryptAESKeyWithUserPrivateKey(encryptedAESKey, privateKey);
          return await decryptWithAES(packet.content, packet.iv, aesKey);
        } catch (e) {
          console.error("AES Key Decryption failed:", e);
          return "__SIGNAL_MISMATCH__";
        }
      } catch (e) {
        console.error("Decryption process failed:", e);
        return "🚫 Packet corrupted during transmission";
      }
    };

  async function regenerateKeys() {
    if (!confirm("Regenerating keys will make all past messages unreadable on this device. New messages will work correctly. Continue?")) return;
    
    try {
      const { generateKeyPair, exportPublicKey, exportPrivateKey } = await import("@/lib/crypto");
      const keyPair = await generateKeyPair();
      const pubKeyBase64 = await exportPublicKey(keyPair.publicKey);
      const privKeyBase64 = await exportPrivateKey(keyPair.privateKey);
      
      localStorage.setItem(`priv_key_${session.user.id}`, privKeyBase64);
      localStorage.setItem(`pub_key_${session.user.id}`, pubKeyBase64);
      
      await supabase.from("profiles").update({
        public_key: pubKeyBase64,
        updated_at: new Date().toISOString(),
      }).eq("id", session.user.id);
      
      toast.success("Security keys regenerated. Refreshing...");
      window.location.reload();
    } catch (err) {
      toast.error("Failed to regenerate keys");
    }
  }

  const deleteMessageAfterView = useCallback(async (messageId: string) => {
    try {
      await supabase.from("messages").delete().eq("id", messageId);
      setMessages(prev => prev.filter(m => m.id !== messageId));
    } catch (err) {
      console.error("Failed to delete message after view:", err);
    }
  }, []);

  const checkAndDeleteExpiredMessages = useCallback(async () => {
    const now = new Date();
    const expiredMessages = messages.filter(msg => {
      if (msg.expires_at) {
        return new Date(msg.expires_at) <= now;
      }
      return false;
    });

    if (expiredMessages.length > 0) {
      const idsToDelete = expiredMessages.map(m => m.id);
      await supabase.from("messages").delete().in("id", idsToDelete);
      setMessages(prev => prev.filter(m => !idsToDelete.includes(m.id)));
    }
  }, [messages]);

  useEffect(() => {
    const interval = setInterval(() => {
      checkAndDeleteExpiredMessages();
    }, 30000);
    return () => clearInterval(interval);
  }, [checkAndDeleteExpiredMessages]);

  async function clearChat() {
    setShowClearConfirm(true);
    setShowMenu(false);
  }

  async function confirmClearChat() {
    try {
      const { error } = await supabase
        .from("messages")
        .delete()
        .or(`and(sender_id.eq.${session.user.id},receiver_id.eq.${contactProfile.id}),and(sender_id.eq.${contactProfile.id},receiver_id.eq.${session.user.id})`);
      
      if (error) throw error;
      
      setMessages([]);
      toast.success("Chat cleared successfully");
      setShowClearConfirm(false);
    } catch (err: any) {
      console.error("Clear chat error:", err);
      toast.error("Failed to clear chat: " + err.message);
    }
  }

  async function fetchMessages() {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from("messages")
        .select("*")
        .or(`and(sender_id.eq.${session.user.id},receiver_id.eq.${contactProfile.id}),and(sender_id.eq.${contactProfile.id},receiver_id.eq.${session.user.id})`)
        .order("created_at", { ascending: true });
      
      if (error) {
        console.error("Supabase fetch error:", error);
        toast.error("Failed to load messages");
        setLoading(false);
        return;
      }

      const decryptedMessages = await Promise.all(
        (data || []).map(async msg => ({ 
          ...msg, 
          decrypted_content: await decryptMessageContent(msg) 
        }))
      );
      
      setMessages(decryptedMessages);
      
      const unviewed = (data || []).filter(m => m.receiver_id === session.user.id && !m.is_viewed);
      if (unviewed.length > 0) {
        await supabase.from("messages").update({ is_viewed: true, viewed_at: new Date().toISOString() }).in("id", unviewed.map(m => m.id));
      }
    } catch (err) {
      console.error("Internal fetch error:", err);
      toast.error("An internal error occurred while fetching messages");
    } finally {
      setLoading(false);
    }
  }

  function subscribeToMessages() {
    return supabase.channel(`chat-events-${contactProfile.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "messages" }, async (payload) => {
        if (payload.eventType === "INSERT") {
          const msg = payload.new;
          if (msg.sender_id === contactProfile.id || msg.receiver_id === contactProfile.id) {
            if (msg.receiver_id === session.user.id) {
              await supabase.from("messages").update({ is_delivered: true, delivered_at: new Date().toISOString(), is_viewed: true, viewed_at: new Date().toISOString() }).eq("id", msg.id);
            }
            const decryptedContent = await decryptMessageContent(msg);
            setMessages(prev => {
              if (prev.find(m => m.id === msg.id)) return prev;
              return [...prev, { ...msg, decrypted_content: decryptedContent }];
            });
          }
        } else if (payload.eventType === "UPDATE") {
          setMessages(prev => prev.map(m => m.id === payload.new.id ? { ...payload.new, decrypted_content: m.decrypted_content } : m));
        } else if (payload.eventType === "DELETE") {
          setMessages(prev => prev.filter(m => m.id !== payload.old.id));
        }
      })
      .subscribe();
  }

  useEffect(() => {
    fetchMessages();
    const subscription = subscribeToMessages();
    return () => { supabase.removeChannel(subscription); };
  }, [contactProfile.id]);

  useEffect(() => {
    const channel = supabase.channel(`presence-chat-${contactProfile.id}`, {
      config: {
        presence: {
          key: session.user.id,
        },
      },
    });

    channel
      .on("presence", { event: "sync" }, () => {
        const state = channel.presenceState();
        const partnerState = state[contactProfile.id] as any;
        if (partnerState && partnerState.length > 0) {
          setPartnerPresence({
            isOnline: true,
            isInChat: partnerState[0].isInChat,
            isTyping: partnerState[0].isTyping,
          });
        } else {
          setPartnerPresence({ isOnline: false, isInChat: false, isTyping: false });
        }
      })
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          await channel.track({
            user_id: session.user.id,
            isInChat: true,
            isTyping: isTyping,
            last_seen: new Date().toISOString(),
          });
        }
      });

    return () => {
      channel.unsubscribe();
    };
  }, [contactProfile.id, isTyping]);

  useEffect(() => {
    if (newMessage.length > 0) {
      setIsTyping(true);
      const timeout = setTimeout(() => setIsTyping(false), 3000);
      return () => clearTimeout(timeout);
    } else {
      setIsTyping(false);
    }
  }, [newMessage]);

  const toggleReaction = async (message: any, emoji: string) => {
    const reactions = message.reactions || {};
    const userId = session.user.id;
    
    if (reactions[emoji]?.includes(userId)) {
      reactions[emoji] = reactions[emoji].filter((id: string) => id !== userId);
      if (reactions[emoji].length === 0) delete reactions[emoji];
    } else {
      if (!reactions[emoji]) reactions[emoji] = [];
      reactions[emoji].push(userId);
    }

    const { error } = await supabase
      .from("messages")
      .update({ reactions })
      .eq("id", message.id);
    
    if (error) toast.error("Failed to add reaction");
    setReactionMenuMessage(null);
  };

  const saveToVault = async (message: any) => {
    const { error } = await supabase
      .from("messages")
      .update({ is_saved: true })
      .eq("id", message.id);
    
    if (error) toast.error("Failed to save message");
    else toast.success("Signal archived in Vault");
    setReactionMenuMessage(null);
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      const chunks: BlobPart[] = [];

      mediaRecorder.ondataavailable = (e) => chunks.push(e.data);
      mediaRecorder.onstop = () => {
        const blob = new Blob(chunks, { type: 'audio/ogg; codecs=opus' });
        setAudioBlob(blob);
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
      setRecordingDuration(0);
      timerRef.current = setInterval(() => {
        setRecordingDuration(prev => prev + 1);
      }, 1000);
    } catch (err) {
      toast.error("Microphone access denied");
    }
  };

  const stopRecording = (send: boolean = true) => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      if (timerRef.current) clearInterval(timerRef.current);
      
      if (send) {
        setTimeout(async () => {
          if (audioBlob) await sendAudioMessage(audioBlob);
        }, 100);
      }
    }
  };

  const sendAudioMessage = async (blob: Blob) => {
    const fileName = `voice-${Date.now()}.ogg`;
    const filePath = `chat/${session.user.id}/${fileName}`;
    const { error } = await supabase.storage.from("chat-media").upload(filePath, blob);
    if (!error) {
      const { data: { publicUrl } } = supabase.storage.from("chat-media").getPublicUrl(filePath);
      await sendMessage("audio", publicUrl);
      setAudioBlob(null);
    }
  };

  const shareLocation = async () => {
    if (!navigator.geolocation) {
      toast.error("Geolocation not supported");
      return;
    }
    navigator.geolocation.getCurrentPosition(async (position) => {
      const { latitude, longitude } = position.coords;
      const mapUrl = `https://www.google.com/maps?q=${latitude},${longitude}`;
      await sendMessage("location", mapUrl);
    }, () => {
      toast.error("Location access denied");
    });
  };

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  async function sendMessage(mediaType: string = "text", mediaUrl: string | null = null) {
    if (!newMessage.trim() && !mediaUrl) return;
    
    try {
      const { data: latestProfile, error: profileError } = await supabase
        .from("profiles")
        .select("public_key")
        .eq("id", contactProfile.id)
        .single();

      if (profileError || !latestProfile?.public_key) {
        toast.error("Could not fetch partner's encryption key. They might need to log in again.");
        return;
      }

      if (!myPublicKey) {
        toast.error("Your encryption keys are not initialized. Please refresh the page.");
        return;
      }
      
      const aesKey = await generateAESKey();
      const contentToEncrypt = newMessage.trim() || " ";
      const encrypted = await encryptWithAES(contentToEncrypt, aesKey);
      
      const partnerKey = await importPublicKey(latestProfile.public_key);
      const encryptedKeyForPartner = await encryptAESKeyForUser(aesKey, partnerKey);
      const encryptedKeyForMe = await encryptAESKeyForUser(aesKey, myPublicKey);
      
      const packet = JSON.stringify({ 
        iv: encrypted.iv, 
        content: encrypted.content, 
        keys: { 
          [session.user.id]: encryptedKeyForMe, 
          [contactProfile.id]: encryptedKeyForPartner 
        } 
      });

      let expiresAt = null;
      if (autoDeleteMode === "1h") {
        expiresAt = new Date(Date.now() + 1 * 60 * 60 * 1000).toISOString();
      } else if (autoDeleteMode === "3h") {
        expiresAt = new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString();
      }

      const messageData: any = { 
        sender_id: session.user.id, 
        receiver_id: contactProfile.id, 
        encrypted_content: packet, 
        media_type: mediaType, 
        media_url: mediaUrl, 
        is_viewed: false, 
        is_delivered: partnerPresence.isOnline, 
        expires_at: expiresAt, 
        is_view_once: autoDeleteMode === "view" 
      };

      if (mediaType === 'snapshot') { 
        messageData.view_count = 0; 
        messageData.is_view_once = true; 
      }

      const { data, error } = await supabase.from("messages").insert(messageData).select();
      
      if (error) {
        console.error("Message insert error:", error);
        toast.error("Failed to send message: " + error.message);
        return;
      }

      const sentMsg = data?.[0] || messageData;
      sentMsg.decrypted_content = contentToEncrypt;
      setMessages(prev => [...prev, sentMsg]);
      setNewMessage("");
      setShowOptions(false);
    } catch (e: any) { 
      console.error("Encryption/Send failed:", e);
      toast.error("Encryption failed: " + (e.message || "Unknown error")); 
    }
  }

  const startCamera = async (facingMode: "user" | "environment" = "user") => {
    try {
      if (stream) stream.getTracks().forEach(track => track.stop());
      const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: facingMode } });
      setStream(s);
      setShowCamera(true);
    } catch (err) { toast.error("Camera access denied"); }
  };

  const capturePhoto = async () => {
    if (!videoRef.current) return;
    const canvas = document.createElement('canvas');
    canvas.width = videoRef.current.videoWidth;
    canvas.height = videoRef.current.videoHeight;
    canvas.getContext('2d')?.drawImage(videoRef.current, 0, 0);
    canvas.toBlob(async (blob) => {
      if (!blob) return;
      const fileName = `snapshot-${Date.now()}.jpg`;
      const filePath = `chat/${session.user.id}/${fileName}`;
      const { error } = await supabase.storage.from("chat-media").upload(filePath, blob);
      if (!error) {
        const { data: { publicUrl } } = supabase.storage.from("chat-media").getPublicUrl(filePath);
        await sendMessage("snapshot", publicUrl);
        setShowCamera(false);
      }
    }, 'image/jpeg');
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, type: "image" | "video" | "audio") => {
    const file = e.target.files?.[0];
    if (!file) return;
    const fileName = `${Math.random()}.${file.name.split(".").pop()}`;
    const filePath = `chat/${session.user.id}/${fileName}`;
    const { error } = await supabase.storage.from("chat-media").upload(filePath, file);
    if (!error) {
      const { data: { publicUrl } } = supabase.storage.from("chat-media").getPublicUrl(filePath);
      await sendMessage(type, publicUrl);
    }
  };

  const openSnapshot = async (message: any) => {
    if (message.receiver_id === session.user.id && (message.view_count || 0) >= 2 && !message.is_saved) { toast.error("Purged"); return; }
    setShowSnapshotView(message);
    if (message.receiver_id === session.user.id) {
      const newViews = (message.view_count || 0) + 1;
      await supabase.from("messages").update({ view_count: newViews, is_viewed: newViews >= 2 }).eq("id", message.id);
    }
  };

  const closeSnapshot = async () => {
    if (showSnapshotView?.receiver_id === session.user.id && !showSnapshotView.is_saved) {
      await supabase.from("messages").update({ is_saved: true, is_viewed: true }).eq("id", showSnapshotView.id);
    }
    setShowSnapshotView(null);
  };

  const getTimeRemaining = (expiresAt: string) => {
    const now = new Date();
    const expires = new Date(expiresAt);
    const diffMs = expires.getTime() - now.getTime();
    if (diffMs <= 0) return "Expiring...";
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 60) return `${diffMins}m left`;
    const diffHours = Math.floor(diffMins / 60);
    return `${diffHours}h ${diffMins % 60}m left`;
  };

  return (
    <div className="flex flex-col h-full bg-[#030303] relative overflow-hidden">
      <header className="h-20 border-b border-white/5 bg-black/40 backdrop-blur-3xl flex items-center justify-between px-6 z-20 shrink-0">
          <div className="flex items-center gap-4">
              <Button variant="ghost" size="icon" onClick={onBack} className="text-white/20 hover:text-white mr-1 lg:hidden bg-white/5 rounded-xl border border-white/5"><ArrowLeft className="w-6 h-6" /></Button>
              <AvatarDisplay profile={initialContact} className="h-10 w-10 ring-2 ring-indigo-500/20" />
              <div>
                <h3 className="text-sm font-black italic tracking-tighter uppercase text-white">{initialContact.username}</h3>
                <div className="flex items-center gap-2">
                  <div className={`w-1.5 h-1.5 rounded-full ${partnerPresence.isOnline ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.8)]' : 'bg-white/20'}`} />
                  <p className="text-[8px] font-bold uppercase tracking-widest text-white/40">
                    {partnerPresence.isOnline ? 'Online' : formatLastSeen(contactProfile.last_seen)}
                  </p>
                </div>
              </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" onClick={() => onInitiateCall(initialContact, "voice")} className="text-white/20 hover:text-white hover:bg-white/5 rounded-xl"><Phone className="w-4 h-4" /></Button>
            <Button variant="ghost" size="icon" onClick={() => onInitiateCall(initialContact, "video")} className="text-white/20 hover:text-white hover:bg-white/5 rounded-xl"><Video className="w-4 h-4" /></Button>
            <div className="relative">
              <Button variant="ghost" size="icon" onClick={() => setShowMenu(!showMenu)} className="text-white/20 hover:text-white hover:bg-white/5 rounded-xl"><MoreVertical className="w-4 h-4" /></Button>
                <AnimatePresence>
                  {showMenu && (
                    <motion.div 
                      initial={{ opacity: 0, y: 10, scale: 0.95 }} 
                      animate={{ opacity: 1, y: 0, scale: 1 }} 
                      exit={{ opacity: 0, y: 10, scale: 0.95 }} 
                      className="absolute right-0 top-12 w-56 bg-zinc-900 border border-white/10 rounded-2xl p-2 shadow-2xl z-50 overflow-hidden"
                    >
                      <div className="space-y-1">
                        <p className="text-[8px] font-black uppercase tracking-[0.2em] text-white/30 px-3 py-2">Auto-Delete Protocol</p>
                        {[
                          { id: "none", label: "No Auto-Delete", icon: null },
                          { id: "view", label: "Delete After View", icon: Eye },
                          { id: "1h", label: "Delete After 1 Hour", icon: Clock },
                          { id: "3h", label: "Delete After 3 Hours", icon: Clock }
                        ].map(opt => (
                          <button 
                            key={opt.id} 
                            onClick={() => { setAutoDeleteMode(opt.id as any); setShowMenu(false); }} 
                            className={`w-full text-left px-3 py-2 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all flex items-center gap-2 ${autoDeleteMode === opt.id ? 'bg-indigo-600 text-white' : 'text-white/60 hover:bg-white/5'}`}
                          >
                            {opt.icon && <opt.icon className="w-3.5 h-3.5" />}
                            {opt.label}
                          </button>
                        ))}
                      </div>
                      
                        <div className="mt-2 pt-2 border-t border-white/5 space-y-1">
                          <button 
                            onClick={regenerateKeys}
                            className="w-full text-left px-3 py-2 rounded-xl text-[10px] font-bold uppercase tracking-widest text-indigo-400 hover:bg-indigo-500/10 transition-all flex items-center gap-2"
                          >
                            <RefreshCw className="w-3.5 h-3.5" />
                            Reset Security Keys
                          </button>
                          <button 
                            onClick={clearChat}
                            className="w-full text-left px-3 py-2 rounded-xl text-[10px] font-bold uppercase tracking-widest text-red-400 hover:bg-red-500/10 transition-all flex items-center gap-2"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            Clear All Chat
                          </button>
                        </div>

                    </motion.div>
                  )}
                </AnimatePresence>
            </div>
          </div>
      </header>

      <div className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-6">
        {loading ? (<div className="flex items-center justify-center h-full animate-spin border-2 border-indigo-500 border-t-transparent rounded-full w-8 h-8 mx-auto" />) : messages.length === 0 ? (<div className="flex flex-col items-center justify-center h-full opacity-20"><ShieldCheck className="w-12 h-12 mb-4" /><p className="text-[10px] font-black uppercase tracking-[0.4em]">End-to-End Encrypted</p></div>) : (
          messages.map((msg) => {
            const isMe = msg.sender_id === session.user.id;
            const hasExpiry = msg.expires_at;
            const isViewOnce = msg.is_view_once && msg.media_type !== 'snapshot';
              return (
                <motion.div 
                  key={msg.id} 
                  initial={{ opacity: 0, y: 10, scale: 0.95 }} 
                  animate={{ opacity: 1, y: 0, scale: 1 }} 
                  className={`flex ${isMe ? "justify-end" : "justify-start"}`}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    setReactionMenuMessage(msg);
                  }}
                >
                  <div className={`max-w-[85%] flex flex-col ${isMe ? "items-end" : "items-start"} group relative`}>
                    {msg.media_type === 'snapshot' ? (
                      <button 
                        onClick={() => openSnapshot(msg)} 
                        className="p-5 rounded-[2.5rem] border bg-indigo-500/10 border-indigo-500/20 hover:bg-indigo-500/20 transition-all flex items-center gap-4 shadow-lg shadow-indigo-500/5 group"
                      >
                        <div className="p-3 bg-indigo-500 rounded-2xl group-hover:scale-110 transition-transform">
                          <Camera className="w-5 h-5 text-white" />
                        </div>
                        <div className="text-left">
                          <p className="text-[10px] font-black uppercase tracking-widest text-white">Hidden Signal</p>
                          <p className="text-[8px] font-bold uppercase tracking-widest text-indigo-400">View Once Protocol</p>
                        </div>
                      </button>
                    ) : msg.media_type === 'image' ? (
                      <div className="relative group">
                        <img src={msg.media_url} alt="" className="rounded-[2.5rem] border border-white/10 max-h-80 shadow-2xl transition-transform hover:scale-[1.02]" />
                        <div className="absolute inset-0 rounded-[2.5rem] bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                           <Download className="w-6 h-6 text-white" />
                        </div>
                      </div>
                    ) : msg.media_type === 'video' ? (
                      <video src={msg.media_url} controls className="rounded-[2.5rem] border border-white/10 max-h-80 shadow-2xl" />
                    ) : msg.media_type === 'audio' ? (
                      <div className={`p-4 rounded-[2rem] flex items-center gap-3 ${isMe ? 'bg-indigo-600' : 'bg-white/5 border border-white/10'}`}>
                        <Play className="w-5 h-5 text-white" />
                        <div className="h-1 w-32 bg-white/20 rounded-full overflow-hidden">
                          <div className="h-full bg-white w-1/3" />
                        </div>
                        <p className="text-[10px] font-bold text-white/60">Voice Signal</p>
                      </div>
                    ) : msg.media_type === 'location' ? (
                      <a href={msg.media_url} target="_blank" rel="noopener noreferrer" className={`p-4 rounded-[2rem] flex items-center gap-3 ${isMe ? 'bg-indigo-600' : 'bg-white/5 border border-white/10'}`}>
                        <MapPin className="w-5 h-5 text-white" />
                        <span className="text-[10px] font-bold uppercase tracking-widest text-white">Live Location Packet</span>
                      </a>
                    ) : (
                        <div className={`p-5 px-6 rounded-[2.2rem] text-[13px] font-medium leading-relaxed shadow-2xl relative transition-all hover:translate-y-[-1px] ${
                          isMe 
                            ? "bg-gradient-to-br from-indigo-600 to-indigo-700 text-white border border-indigo-500/30 rounded-tr-none" 
                            : "bg-white/[0.04] backdrop-blur-xl border border-white/10 text-white/90 rounded-tl-none"
                        }`}>
                          {msg.decrypted_content === "__SIGNAL_MISMATCH__" ? (
                            <div className="flex flex-col gap-2">
                              <span className="text-red-400 font-bold flex items-center gap-2">
                                <Shield className="w-4 h-4" /> Signal Mismatch
                              </span>
                              <span className="text-[10px] text-white/40 leading-tight">Identity mismatch across devices. Sync required.</span>
                              <button 
                                onClick={(e) => { e.stopPropagation(); repairIdentity(); }}
                                className="mt-1 px-4 py-2 bg-indigo-500/20 hover:bg-indigo-500/40 border border-indigo-500/30 rounded-xl text-[9px] font-black uppercase tracking-[0.2em] text-indigo-400 transition-all active:scale-95"
                              >
                                Auto-Repair Signal
                              </button>
                            </div>
                          ) : (
                            msg.decrypted_content || "🔒 Signal Encrypted"
                          )}
                        {isViewOnce && (
                          <div className="absolute -top-3 -right-3 bg-gradient-to-br from-orange-500 to-red-500 rounded-full p-1.5 shadow-lg border border-black/20">
                            <Eye className="w-3 h-3 text-white" />
                          </div>
                        )}
                        {msg.is_saved && (
                          <div className="absolute -top-3 -left-3 bg-emerald-500 rounded-full p-1.5 shadow-lg border border-black/20">
                            <Save className="w-3 h-3 text-white" />
                          </div>
                        )}
                      </div>
                    )}

                    {/* Reactions Display */}
                    {msg.reactions && Object.keys(msg.reactions).length > 0 && (
                      <div className={`flex flex-wrap gap-1 mt-1 ${isMe ? 'justify-end' : 'justify-start'}`}>
                        {Object.entries(msg.reactions).map(([emoji, users]: [string, any]) => (
                          <button 
                            key={emoji}
                            onClick={() => toggleReaction(msg, emoji)}
                            className={`px-2 py-1 rounded-full text-[10px] flex items-center gap-1 border transition-all ${
                              users.includes(session.user.id) ? 'bg-indigo-500/20 border-indigo-500/40 text-white' : 'bg-white/5 border-white/10 text-white/40'
                            }`}
                          >
                            <span>{emoji}</span>
                            <span>{users.length}</span>
                          </button>
                        ))}
                      </div>
                    )}

                    <div className={`flex items-center gap-3 mt-2 px-3 opacity-0 group-hover:opacity-100 transition-opacity duration-300 ${isMe ? "flex-row-reverse" : "flex-row"}`}>
                      <span className="text-[8px] font-bold uppercase tracking-widest text-white/20">
                        {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true })}
                      </span>
                      {hasExpiry && (
                        <div className="flex items-center gap-1.5 px-2 py-0.5 bg-orange-500/10 border border-orange-500/20 rounded-full">
                          <Clock className="w-2.5 h-2.5 text-orange-400" />
                          <span className="text-[7px] font-black uppercase tracking-widest text-orange-400">
                            {getTimeRemaining(msg.expires_at)}
                          </span>
                        </div>
                      )}
                      {isMe && (
                        <div className="flex items-center">
                          {msg.is_viewed ? (
                            <CheckCheck className="w-3 h-3 text-indigo-400" />
                          ) : (
                            <Check className="w-3 h-3 text-white/20" />
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </motion.div>
              );

          })
        )}

        {/* Typing Indicator */}
        <AnimatePresence>
          {partnerPresence.isTyping && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
              className="flex justify-start"
            >
              <div className="bg-white/[0.04] backdrop-blur-xl border border-white/10 rounded-[1.5rem] rounded-tl-none p-4 flex items-center gap-1.5">
                <motion.div animate={{ y: [0, -4, 0] }} transition={{ repeat: Infinity, duration: 0.6 }} className="w-1.5 h-1.5 bg-indigo-500 rounded-full" />
                <motion.div animate={{ y: [0, -4, 0] }} transition={{ repeat: Infinity, duration: 0.6, delay: 0.2 }} className="w-1.5 h-1.5 bg-indigo-500 rounded-full" />
                <motion.div animate={{ y: [0, -4, 0] }} transition={{ repeat: Infinity, duration: 0.6, delay: 0.4 }} className="w-1.5 h-1.5 bg-indigo-500 rounded-full" />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
        <div ref={messagesEndRef} />
      </div>

      <footer className="p-6 bg-black/40 backdrop-blur-3xl border-t border-white/5 shrink-0">
          {autoDeleteMode !== "none" && (
            <div className="mb-3 flex items-center justify-center gap-2">
              <div className={`px-3 py-1.5 rounded-full text-[8px] font-black uppercase tracking-widest flex items-center gap-1.5 ${
                autoDeleteMode === "view" ? "bg-orange-500/20 text-orange-400 border border-orange-500/30" :
                autoDeleteMode === "1h" ? "bg-amber-500/20 text-amber-400 border border-amber-500/30" :
                "bg-red-500/20 text-red-400 border border-red-500/30"
              }`}>
                {autoDeleteMode === "view" ? <Eye className="w-3 h-3" /> : <Clock className="w-3 h-3" />}
                {autoDeleteMode === "view" ? "Delete After View" : autoDeleteMode === "1h" ? "Delete After 1 Hour" : "Delete After 3 Hours"}
              </div>
            </div>
          )}

          {/* Recording UI */}
          <AnimatePresence>
            {isRecording && (
              <motion.div 
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 10 }}
                className="mb-4 flex items-center justify-between bg-red-500/10 border border-red-500/20 rounded-2xl p-4"
              >
                <div className="flex items-center gap-3">
                  <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
                  <span className="text-[10px] font-black uppercase tracking-[0.2em] text-red-400">
                    Recording Signal... {Math.floor(recordingDuration / 60)}:{String(recordingDuration % 60).padStart(2, '0')}
                  </span>
                </div>
                <div className="flex gap-2">
                  <Button variant="ghost" size="icon" onClick={() => stopRecording(false)} className="text-red-400 hover:bg-red-500/20 rounded-xl"><X className="w-4 h-4" /></Button>
                  <Button onClick={() => stopRecording(true)} className="bg-red-500 hover:bg-red-600 rounded-xl px-4 text-[10px] font-black uppercase tracking-widest">Transmit</Button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="flex items-center gap-3 relative">
            <Button variant="ghost" size="icon" onClick={() => setShowOptions(!showOptions)} className={`h-12 w-12 rounded-2xl transition-all ${showOptions ? 'bg-indigo-600 text-white rotate-45' : 'bg-white/5 text-white/20'}`}><Plus className="w-6 h-6" /></Button>
            <input value={newMessage} onChange={(e) => setNewMessage(e.target.value)} onKeyDown={(e) => e.key === "Enter" && sendMessage()} placeholder="Type signal packet..." className="flex-1 bg-white/[0.03] border border-white/10 rounded-[2rem] h-12 px-6 text-sm outline-none focus:border-indigo-500/50" />
            {!newMessage.trim() ? (
              <Button onClick={isRecording ? () => stopRecording(true) : startRecording} className={`h-12 w-12 rounded-2xl ${isRecording ? 'bg-red-600 animate-pulse' : 'bg-white/5 text-white/40'} hover:bg-indigo-500 transition-all shadow-lg`}>
                <Mic className="w-5 h-5" />
              </Button>
            ) : (
              <Button onClick={() => sendMessage()} className="h-12 w-12 rounded-2xl bg-indigo-600 hover:bg-indigo-500 shadow-lg shadow-indigo-600/20"><Send className="w-5 h-5" /></Button>
            )}

            <AnimatePresence>
              {showOptions && (
                <motion.div 
                  initial={{ opacity: 0, y: 10, scale: 0.9 }} 
                  animate={{ opacity: 1, y: 0, scale: 1 }} 
                  exit={{ opacity: 0, y: 10, scale: 0.9 }} 
                  className="absolute bottom-20 left-0 w-80 bg-[#0a0a0a]/95 backdrop-blur-2xl border border-white/10 rounded-[2.5rem] p-6 shadow-2xl z-50 overflow-hidden"
                >
                  <div className="grid grid-cols-3 gap-3">
                    <label className="flex flex-col items-center justify-center p-4 bg-white/[0.02] border border-white/5 rounded-2xl cursor-pointer hover:bg-white/5 transition-all group">
                      <ImageIcon className="w-6 h-6 text-indigo-400 mb-2 group-hover:scale-110 transition-transform" />
                      <span className="text-[8px] font-black uppercase text-white/40">Photo</span>
                      <input type="file" className="hidden" accept="image/*" onChange={(e) => handleFileUpload(e, "image")} />
                    </label>
                    <label className="flex flex-col items-center justify-center p-4 bg-white/[0.02] border border-white/5 rounded-2xl cursor-pointer hover:bg-white/5 transition-all group">
                      <Video className="w-6 h-6 text-purple-400 mb-2 group-hover:scale-110 transition-transform" />
                      <span className="text-[8px] font-black uppercase text-white/40">Video</span>
                      <input type="file" className="hidden" accept="video/*" onChange={(e) => handleFileUpload(e, "video")} />
                    </label>
                    <button onClick={() => startCamera()} className="flex flex-col items-center justify-center p-4 bg-white/[0.02] border border-white/5 rounded-2xl hover:bg-white/5 transition-all group">
                      <Camera className="w-6 h-6 text-emerald-400 mb-2 group-hover:scale-110 transition-transform" />
                      <span className="text-[8px] font-black uppercase text-white/40">Snapshot</span>
                    </button>
                    <button onClick={shareLocation} className="flex flex-col items-center justify-center p-4 bg-white/[0.02] border border-white/5 rounded-2xl hover:bg-white/5 transition-all group">
                      <MapPin className="w-6 h-6 text-amber-400 mb-2 group-hover:scale-110 transition-transform" />
                      <span className="text-[8px] font-black uppercase text-white/40">Location</span>
                    </button>
                    <label className="flex flex-col items-center justify-center p-4 bg-white/[0.02] border border-white/5 rounded-2xl cursor-pointer hover:bg-white/5 transition-all group">
                      <Paperclip className="w-6 h-6 text-rose-400 mb-2 group-hover:scale-110 transition-transform" />
                      <span className="text-[8px] font-black uppercase text-white/40">File</span>
                      <input type="file" className="hidden" onChange={(e) => handleFileUpload(e, "image")} />
                    </label>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
      </footer>

      {/* Message Reaction / Context Menu */}
      <AnimatePresence>
        {reactionMenuMessage && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-6 bg-black/60 backdrop-blur-md" onClick={() => setReactionMenuMessage(null)}>
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-zinc-900 border border-white/10 rounded-[2.5rem] p-6 w-full max-w-sm shadow-2xl space-y-6"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="grid grid-cols-5 gap-2">
                {['👍', '❤️', '😂', '😮', '😢', '🔥', '👏', '💯', '🙏', '✨'].map(emoji => (
                  <button 
                    key={emoji}
                    onClick={() => toggleReaction(reactionMenuMessage, emoji)}
                    className="text-2xl p-2 hover:bg-white/10 rounded-2xl transition-all hover:scale-110"
                  >
                    {emoji}
                  </button>
                ))}
              </div>
              <div className="space-y-2">
                <button 
                  onClick={() => saveToVault(reactionMenuMessage)}
                  className="w-full flex items-center justify-between p-4 bg-white/5 hover:bg-white/10 rounded-2xl border border-white/5 transition-all group"
                >
                  <span className="text-xs font-black uppercase tracking-widest text-white/60 group-hover:text-white">Archived in Vault</span>
                  <Save className="w-5 h-5 text-indigo-400" />
                </button>
                <button 
                  onClick={async () => {
                    await supabase.from("messages").delete().eq("id", reactionMenuMessage.id);
                    setMessages(prev => prev.filter(m => m.id !== reactionMenuMessage.id));
                    setReactionMenuMessage(null);
                  }}
                  className="w-full flex items-center justify-between p-4 bg-red-500/10 hover:bg-red-500/20 rounded-2xl border border-red-500/20 transition-all group"
                >
                  <span className="text-xs font-black uppercase tracking-widest text-red-400">Purge Signal</span>
                  <Trash2 className="w-5 h-5 text-red-400" />
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>{showCamera && (<div className="fixed inset-0 z-[150] bg-black flex flex-col items-center justify-center"><video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" /><div className="absolute bottom-10 flex gap-6 items-center"><Button onClick={() => setShowCamera(false)} variant="ghost" className="bg-white/10 hover:bg-white/20 rounded-full h-14 w-14"><X className="w-6 h-6 text-white" /></Button><button onClick={capturePhoto} className="w-20 h-20 rounded-full border-4 border-white flex items-center justify-center"><div className="w-14 h-14 rounded-full bg-white" /></button></div></div>)}</AnimatePresence>

      <AnimatePresence>{showSnapshotView && (<motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }} className="fixed inset-0 z-[100] bg-black backdrop-blur-3xl flex items-center justify-center p-3 sm:p-6"><div className="relative w-full max-w-2xl bg-black rounded-[2rem] overflow-hidden border border-white/10 flex flex-col"><img src={showSnapshotView.media_url} alt="" className="w-full h-full object-contain" /><button onClick={closeSnapshot} className="absolute top-4 right-4 w-12 h-12 bg-black/50 backdrop-blur-md rounded-full flex items-center justify-center border border-white/10"><X className="w-6 h-6 text-white" /></button></div></motion.div>)}</AnimatePresence>

      <AnimatePresence>
        {showClearConfirm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[300] flex items-center justify-center p-6 bg-black/60 backdrop-blur-md"
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-zinc-900 border border-white/10 rounded-3xl p-8 max-w-sm w-full text-center space-y-6 shadow-2xl"
            >
              <div className="w-16 h-16 bg-red-500/10 rounded-2xl flex items-center justify-center mx-auto">
                <Trash2 className="w-8 h-8 text-red-500" />
              </div>
              <div>
                <h3 className="text-xl font-black uppercase italic">Clear Chat?</h3>
                <p className="text-sm text-white/40 mt-2">This will permanently delete your message history with {contactProfile.username}. This action cannot be undone.</p>
              </div>
              <div className="flex gap-3">
                <Button
                  onClick={() => setShowClearConfirm(false)}
                  variant="ghost"
                  className="flex-1 bg-white/5 hover:bg-white/10 text-xs font-bold uppercase py-6 rounded-2xl"
                >
                  Cancel
                </Button>
                <Button
                  onClick={confirmClearChat}
                  className="flex-1 bg-red-600 hover:bg-red-700 text-xs font-bold uppercase py-6 rounded-2xl"
                >
                  Clear
                </Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
