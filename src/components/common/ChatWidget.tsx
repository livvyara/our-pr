import React, { useState, useEffect, useRef, useMemo, type FormEvent, type ClipboardEvent } from 'react';
import { 
    getFirestore, collection, query, where, orderBy, onSnapshot, 
    addDoc, serverTimestamp, doc, updateDoc, getDoc 
} from 'firebase/firestore';
import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { auth } from '../../firebase-config';
import imageCompression from 'browser-image-compression'; 
import { ChatIcons } from './ChatIcons'; 
import './ChatWidget.css'; 
import ReactDOM from 'react-dom';


interface ChatRoom {
    id: string;
    participants: string[];
    lastMessage: string;
    updatedAt: any;
    unreadCount: number;
    siteName?: string;
    participantNames: string[];
    lastRead?: Record<string, any>;
    status?: string; 
}

interface Message {
    id: string;
    senderId: string;
    text: string;
    type: 'text' | 'image' | 'meeting' | 'system';
    imageUrl?: string;
    meetingDate?: string;
    meetingTime?: string;
    createdAt: any;
    senderName?: string;
}

interface UserInfo { uid: string; name: string; }

const EMOJI_LIST = ["😀","😁","😂","🤣","😍","😎","😭","👍","👎","👌","❤️","✅","🔥","✨","🎉","🏗️","🏠","🔨"];

const ChatWidget: React.FC<{ onClose: () => void }> = ({ onClose }) => {
    const db = getFirestore();
    const storage = getStorage();
    const currentUser = auth.currentUser;
    
    // --- State ---
    const [viewMode, setViewMode] = useState<'list' | 'room'>('list');
    const [chatRooms, setChatRooms] = useState<ChatRoom[]>([]);
    const [currentRoomId, setCurrentRoomId] = useState<string | null>(null);
    const [messages, setMessages] = useState<Message[]>([]);
    const [inputText, setInputText] = useState('');
    
    // [기능 복구] 서랍(메뉴) 상태
    const [isDrawerOpen, setIsDrawerOpen] = useState(false);
    const [drawerContent, setDrawerContent] = useState<'menu' | 'participants' | 'gallery'>('menu');
    const [participantsList, setParticipantsList] = useState<UserInfo[]>([]);
    
    // [기능 복구] 검색 모드 상태
    const [isSearchMode, setIsSearchMode] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');

    const [showMeetingForm, setShowMeetingForm] = useState(false);
    const [meetingDate, setMeetingDate] = useState('');
    const [meetingTime, setMeetingTime] = useState('');
    const [meetingContent, setMeetingContent] = useState('');

    const [showEmojiPicker, setShowEmojiPicker] = useState(false); 
    const [isUploading, setIsUploading] = useState(false);
    const [userCache, setUserCache] = useState<Record<string, string>>({}); 
    
    // PC 드래그 위치 상태
    const [position, setPosition] = useState({ x: window.innerWidth - 420 - 20, y: 80 });
    const [isDragging, setIsDragging] = useState(false);
    const dragStartPos = useRef({ x: 0, y: 0 });

    const messagesContainerRef = useRef<HTMLDivElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const activeRoom = useMemo(() => 
        chatRooms.find(r => r.id === currentRoomId), 
    [chatRooms, currentRoomId]);

    // --- Helpers ---
    const getUserName = async (uid: string) => {
        if (uid === 'system') return '시스템';
        if (uid === currentUser?.uid) return '나';
        if (userCache[uid]) return userCache[uid];
        try {
            const snap = await getDoc(doc(db, 'users', uid));
            if (snap.exists()) {
                const d = snap.data();
                const name = d.name || d.nickname || '알수없음';
                setUserCache(prev => ({ ...prev, [uid]: name }));
                return name;
            }
        } catch (e) { /* ignore */ }
        return '알수없음';
    };

    const scrollToBottom = () => {
        if (messagesContainerRef.current) {
            messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight;
        }
    };

    const updateLastRead = async (roomId: string) => {
        if (!currentUser) return;
        try {
            await updateDoc(doc(db, 'chats', roomId), {
                [`lastRead.${currentUser.uid}`]: serverTimestamp()
            });
        } catch (e) { console.error(e); }
    };

    // --- Effects ---
    const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
        const isMobile = window.innerWidth <= 768;
        if (isMobile) return; 
        if ((e.target as HTMLElement).closest('button')) return;
        setIsDragging(true);
        dragStartPos.current = { x: e.clientX - position.x, y: e.clientY - position.y };
    };

    useEffect(() => {
        const handleMouseMove = (e: MouseEvent) => {
            if (!isDragging) return;
            if (window.innerWidth > 768) {
                setPosition({ x: e.clientX - dragStartPos.current.x, y: e.clientY - dragStartPos.current.y });
            }
        };
        const handleMouseUp = () => setIsDragging(false);
        if (isDragging) {
            window.addEventListener('mousemove', handleMouseMove);
            window.addEventListener('mouseup', handleMouseUp);
        }
        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        };
    }, [isDragging]);

    useEffect(() => {
        if (!currentUser) return;
        const q = query(collection(db, 'chats'), where('participants', 'array-contains', currentUser.uid), orderBy('updatedAt', 'desc'));
        const unsubscribe = onSnapshot(q, async (snapshot) => {
            const rooms = await Promise.all(snapshot.docs.map(async docSnap => {
                const data = docSnap.data();
                const pUids = data.participants || [];
                const names: string[] = [];
                let count = 0;
                let othersCount = 0;
                for (const uid of pUids) {
                    if (uid !== currentUser.uid) {
                        if (count < 2) {
                            const name = await getUserName(uid);
                            names.push(name);
                            count++;
                        } else { othersCount++; }
                    }
                }
                if (othersCount > 0) names.push(`외 ${othersCount}명`);
                return {
                    id: docSnap.id, participants: pUids, lastMessage: data.lastMessage || '(대화 없음)', updatedAt: data.updatedAt, lastRead: data.lastRead || {}, unreadCount: 0,
                    siteName: data.siteName || "현장 채팅", participantNames: names, status: data.status || 'active'
                } as ChatRoom;
            }));
            setChatRooms(rooms);
        });
        return () => unsubscribe();
    }, [currentUser]);

    useEffect(() => {
        if (!currentRoomId) return;
        updateLastRead(currentRoomId);
        const q = query(collection(db, 'chats', currentRoomId, 'messages'), orderBy('createdAt', 'asc'));
        const unsubscribe = onSnapshot(q, async (snapshot) => {
            const msgs = await Promise.all(snapshot.docs.map(async d => {
                const mData = d.data();
                const senderName = await getUserName(mData.senderId);
                return { id: d.id, ...mData, senderName } as Message;
            }));
            setMessages(msgs);
            if (!isSearchMode) { setTimeout(scrollToBottom, 100); updateLastRead(currentRoomId); }
        });
        return () => unsubscribe();
    }, [currentRoomId]);

    // --- Actions ---
    const sendMessage = async (text: string, type: 'text'|'image'|'meeting' = 'text', extraData: any = {}) => {
        if (!currentRoomId || !currentUser) return;
        if (activeRoom?.status === 'closed') { alert("종료된 채팅방입니다."); return; }
        try {
            await addDoc(collection(db, 'chats', currentRoomId, 'messages'), {
                text, senderId: currentUser.uid, type, createdAt: serverTimestamp(), ...extraData
            });
            const lastMsgText = type === 'image' ? '📷 사진' : type === 'meeting' ? '📅 일정' : text;
            await updateDoc(doc(db, 'chats', currentRoomId), {
                lastMessage: lastMsgText, updatedAt: serverTimestamp(), [`lastRead.${currentUser.uid}`]: serverTimestamp()
            });
        } catch (e) { console.error(e); }
    };

    const handleTextSubmit = (e?: FormEvent) => {
        if(e) e.preventDefault();
        if (!inputText.trim()) return;
        sendMessage(inputText);
        setInputText('');
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleTextSubmit();
        }
    };

    const uploadImage = async (file: File) => {
        if (!currentRoomId || !currentUser || activeRoom?.status === 'closed') return;
        setIsUploading(true);
        try {
            const compressed = await imageCompression(file, { maxSizeMB: 1, maxWidthOrHeight: 1920 });
            const storageRef = ref(storage, `chats/${currentRoomId}/${Date.now()}_${file.name}`);
            await uploadBytes(storageRef, compressed);
            const url = await getDownloadURL(storageRef);
            await sendMessage('', 'image', { imageUrl: url });
        } catch (e) { alert("이미지 전송 실패"); } finally { setIsUploading(false); }
    };
    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => { if (e.target.files && e.target.files[0]) uploadImage(e.target.files[0]); };
    
    const handlePaste = (e: ClipboardEvent) => {
        if (activeRoom?.status === 'closed') return;
        const items = e.clipboardData.items;
        for (let i = 0; i < items.length; i++) {
            if (items[i].type.indexOf("image") !== -1) {
                const file = items[i].getAsFile();
                if (file) uploadImage(file);
                e.preventDefault(); 
            }
        }
    };

    const handleCreateMeeting = async () => {
        if (activeRoom?.status === 'closed') return;
        if (!meetingDate || !meetingTime || !meetingContent || !currentRoomId || !currentUser) return alert("모든 항목을 입력해주세요.");
        try {
            const roomSnap = await getDoc(doc(db, 'chats', currentRoomId));
            const ownerUid = roomSnap.exists() ? roomSnap.data().ownerUid : currentUser.uid;
            const sName = activeRoom?.siteName || '현장';
            await addDoc(collection(db, 'users', ownerUid, 'memos'), {
                memoContent: meetingContent, memoType: 'meeting', meetingDate: meetingDate, meetingTime: meetingTime,
                siteId: currentRoomId, siteName: sName, partnerUid: ownerUid, createdAt: serverTimestamp(), authorName: await getUserName(currentUser.uid)
            });
            await sendMessage(meetingContent, 'meeting', { meetingDate, meetingTime });
            setShowMeetingForm(false); setMeetingDate(''); setMeetingTime(''); setMeetingContent('');
        } catch(e) { alert("오류 발생"); }
    };

    const handleEmojiClick = (emoji: string) => {
        if (activeRoom?.status === 'closed') return;
        setInputText(prev => prev + emoji);
        setShowEmojiPicker(false);
    };

    const loadParticipants = async () => {
        if (!currentRoomId) return;
        const room = chatRooms.find(r => r.id === currentRoomId);
        if (!room) return;
        const list: UserInfo[] = [];
        for (const uid of room.participants) {
            const name = await getUserName(uid);
            list.push({ uid, name });
        }
        setParticipantsList(list);
        setDrawerContent('participants');
        setIsDrawerOpen(true);
    };

    const filteredMessages = useMemo(() => {
        if (!isSearchMode || !searchQuery) return messages;
        return messages.filter(m => m.text && m.text.includes(searchQuery));
    }, [messages, isSearchMode, searchQuery]);

    const galleryImages = useMemo(() => {
        return messages.filter(m => m.type === 'image' && m.imageUrl);
    }, [messages]);

    const widgetContent = (
        <div 
            className="chat-widget-popup" 
            style={window.innerWidth > 768 ? { left: position.x, top: position.y } : {}}
            // 모바일에서는 style 속성(position)을 무시하도록 조건부 적용
        >
            {/* Header */}
            <div className="chat-widget-header" onMouseDown={handleMouseDown}>
                {viewMode === 'room' && (
                    <button className="chat-widget-btn-icon back-btn" onClick={() => { setViewMode('list'); setCurrentRoomId(null); }}>
                        <ChatIcons.Back />
                    </button>
                )}
                <div className="chat-widget-header-title">
                    <h3 title={activeRoom?.siteName || "채팅"}>
                        {viewMode === 'list' ? '메시지' : (activeRoom?.siteName || '현장 채팅')}
                    </h3>
                    {viewMode === 'room' && activeRoom && (
                        <span className="chat-widget-header-subtitle">
                             {activeRoom.participantNames.join(', ')}
                        </span>
                    )}
                </div>
                
                <div className="header-actions">
                    {viewMode === 'room' && (
                        <>
                            {/* [기능 복구] 헤더 검색 버튼 */}
                            <button className={`chat-widget-btn-icon ${isSearchMode ? 'active' : ''}`} title="검색" onClick={() => setIsSearchMode(!isSearchMode)}>
                                <ChatIcons.Search />
                            </button>
                            {/* [기능 복구] 햄버거 메뉴 */}
                            <button className="chat-widget-btn-icon" title="메뉴" onClick={() => { setIsDrawerOpen(true); setDrawerContent('menu'); }}>
                                <ChatIcons.Menu />
                            </button>
                        </>
                    )}
                    <button className="chat-widget-btn-icon close-btn" onClick={onClose}><ChatIcons.Close /></button>
                </div>
            </div>

            {/* Body */}
            <div className="chat-widget-body">
                {viewMode === 'list' ? (
                    <div className="chat-widget-room-list">
                        {chatRooms.length === 0 ? <div className="chat-widget-empty-state">대화가 없습니다.</div> : 
                         chatRooms.map(room => {
                            const myReadTime = room.lastRead?.[currentUser?.uid || '']?.toMillis() || 0;
                            const updateTime = room.updatedAt?.toMillis() || 0;
                            const hasUnread = updateTime > myReadTime;
                            return (
                                <div key={room.id} className={`chat-widget-room-item ${hasUnread ? 'unread' : ''}`} onClick={() => { setCurrentRoomId(room.id); setViewMode('room'); }}>
                                    <div className="chat-widget-room-avatar"><ChatIcons.Site /></div>
                                    <div className="chat-widget-room-info">
                                        <div className="room-top">
                                            <span className="chat-widget-room-name">{room.siteName}</span>
                                            <span className="chat-widget-room-date">{room.updatedAt?.toDate ? room.updatedAt.toDate().toLocaleDateString() : '-'}</span>
                                        </div>
                                        <div className="room-bottom">
                                            <span className="chat-widget-room-last-msg">{room.lastMessage}</span>
                                            {hasUnread && <span className="unread-dot"></span>}
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                ) : (
                    <div className="chat-widget-room-view">
                        {/* [기능 복구] 검색바 */}
                        {isSearchMode && (
                            <div className="chat-widget-search-bar">
                                <input autoFocus placeholder="대화 내용을 검색하세요" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
                                <button onClick={() => { setIsSearchMode(false); setSearchQuery(''); }}>취소</button>
                            </div>
                        )}

                        <div className="chat-widget-messages-area" ref={messagesContainerRef}>
                            {(isSearchMode ? filteredMessages : messages).map((msg, idx) => {
                                const isMe = msg.senderId === currentUser?.uid;
                                // 날짜 구분선
                                const prevMsg = messages[idx - 1];
                                const isNewDay = !prevMsg || (msg.createdAt?.toDate().getDate() !== prevMsg.createdAt?.toDate().getDate());

                                if (msg.type === 'system') return <div key={msg.id} className="chat-widget-system-msg">{msg.text}</div>;
                                
                                return (
                                    <React.Fragment key={msg.id}>
                                        {isNewDay && msg.createdAt?.toDate && (
                                            <div className="chat-widget-date-divider">
                                                <span>{msg.createdAt.toDate().toLocaleDateString()}</span>
                                            </div>
                                        )}
                                        <div className={`chat-widget-message-container ${isMe ? 'me' : 'other'}`}>
                                            {!isMe && <div className="chat-widget-sender-name">{msg.senderName}</div>}
                                            <div className="chat-widget-bubble-wrapper">
                                                <div className={`chat-widget-message-bubble ${isMe ? 'me' : 'other'}`}>
                                                    {msg.type === 'text' && <span className={isSearchMode && searchQuery && msg.text.includes(searchQuery) ? 'highlight' : ''}>{msg.text}</span>}
                                                    {msg.type === 'image' && msg.imageUrl && <img src={msg.imageUrl} className="chat-widget-message-image" onClick={() => window.open(msg.imageUrl, '_blank')} alt="첨부" />}
                                                    {msg.type === 'meeting' && (
                                                        <div className="meeting-card">
                                                            <div className="meeting-icon">📅</div>
                                                            <div>
                                                                <div className="meeting-title">일정 등록</div>
                                                                <div className="meeting-desc">{msg.meetingDate} {msg.meetingTime}</div>
                                                                <div className="meeting-desc">{msg.text}</div>
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                                <span className="chat-widget-msg-time">
                                                    {msg.createdAt?.toDate ? msg.createdAt.toDate().toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'}) : ''}
                                                </span>
                                            </div>
                                        </div>
                                    </React.Fragment>
                                );
                            })}
                        </div>

                        {/* 약속 잡기 폼 */}
                        {showMeetingForm && (
                            <div className="chat-widget-meeting-form">
                                <div className="form-header">📅 일정 등록</div>
                                <div className="form-row">
                                    <input type="date" value={meetingDate} onChange={e=>setMeetingDate(e.target.value)} />
                                    <input type="time" value={meetingTime} onChange={e=>setMeetingTime(e.target.value)} />
                                </div>
                                <input className="form-input" placeholder="일정 내용" value={meetingContent} onChange={e=>setMeetingContent(e.target.value)} />
                                <div className="form-actions">
                                    <button className="btn-cancel" onClick={() => setShowMeetingForm(false)}>취소</button>
                                    <button className="btn-confirm" onClick={handleCreateMeeting}>등록</button>
                                </div>
                            </div>
                        )}

                        {/* 이모티콘 피커 */}
                        {showEmojiPicker && (
                            <div className="chat-widget-emoji-picker">
                                <div className="emoji-grid">
                                    {EMOJI_LIST.map(em => <button key={em} onClick={() => handleEmojiClick(em)}>{em}</button>)}
                                </div>
                                <button className="emoji-close-btn" onClick={() => setShowEmojiPicker(false)}>닫기</button>
                            </div>
                        )}

                        {/* 입력창 */}
                        {activeRoom?.status === 'closed' ? (
                            <div className="chat-widget-closed-notice">🚫 종료된 대화방입니다.</div>
                        ) : (
                            <form className="chat-widget-input-area" onSubmit={handleTextSubmit}>
                                <div className="chat-widget-input-toolbar">
                                    <button type="button" onClick={() => fileInputRef.current?.click()}><ChatIcons.Image /></button>
                                    <button type="button" onClick={() => setShowMeetingForm(!showMeetingForm)}><ChatIcons.Calendar /></button>
                                    <button type="button" onClick={() => setShowEmojiPicker(!showEmojiPicker)}><ChatIcons.Emoji /></button>
                                </div>
                                <div className="chat-widget-input-wrapper">
                                    <textarea 
                                        value={inputText} 
                                        onChange={e => setInputText(e.target.value)} 
                                        onKeyDown={handleKeyDown}
                                        onPaste={handlePaste} 
                                        placeholder="메시지 입력..." 
                                        rows={1}
                                    />
                                    <button type="submit" className="btn-send" disabled={!inputText.trim() && !isUploading}>
                                        {isUploading ? '...' : <ChatIcons.Send />}
                                    </button>
                                </div>
                                <input type="file" accept="image/*" ref={fileInputRef} style={{display:'none'}} onChange={handleFileChange} />
                            </form>
                        )}
                    </div>
                )}
            </div>

            {/* Drawer (슬라이드 메뉴) */}
            <div className={`chat-widget-drawer ${isDrawerOpen ? 'open' : ''}`}>
                <div className="chat-widget-drawer-header">
                    <span>{drawerContent === 'menu' ? '메뉴' : drawerContent === 'participants' ? '대화 상대' : '사진 앨범'}</span>
                    <button className="btn-icon" onClick={() => { if(drawerContent === 'menu') setIsDrawerOpen(false); else setDrawerContent('menu'); }}>
                        {drawerContent === 'menu' ? <ChatIcons.Close /> : <ChatIcons.Back />}
                    </button>
                </div>
                <div className="chat-widget-drawer-body">
                    {drawerContent === 'menu' && (
                        <div className="drawer-menu-list">
                            <button onClick={loadParticipants}>
                                <span className="icon"><ChatIcons.User /></span> 대화 참여자
                            </button>
                            {/* [기능 복구] 사진 개수 표시 */}
                            <button onClick={() => setDrawerContent('gallery')}>
                                <span className="icon"><ChatIcons.Image /></span> 사진 앨범 ({galleryImages.length})
                            </button>
                            {/* [기능 복구] 검색 트리거 */}
                            <button onClick={() => { setIsSearchMode(true); setIsDrawerOpen(false); }}>
                                <span className="icon"><ChatIcons.Search /></span> 대화 내용 검색
                            </button>
                        </div>
                    )}
                    {drawerContent === 'participants' && (
                        <div className="participant-list">
                            {participantsList.map(p => (
                                <div key={p.uid} className="participant-item">
                                    <div className="p-avatar"><ChatIcons.User /></div>
                                    <span>{p.name}</span>
                                </div>
                            ))}
                        </div>
                    )}
                    {drawerContent === 'gallery' && (
                        <div className="gallery-grid">
                            {/* [기능 복구] 사진 간격은 CSS에서 처리 */}
                            {galleryImages.map(img => (
                                <div key={img.id} className="gallery-item" onClick={() => window.open(img.imageUrl, '_blank')}>
                                    <img src={img.imageUrl} alt="gallery" />
                                </div>
                            ))}
                            {galleryImages.length === 0 && <p className="empty-msg">공유된 사진이 없습니다.</p>}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
    return ReactDOM.createPortal(widgetContent, document.body);
};

export default ChatWidget;