import React, { useState, useEffect, useRef, useMemo, type FormEvent, type ChangeEvent, type ClipboardEvent } from 'react';
import { 
    getFirestore, collection, query, where, orderBy, onSnapshot, 
    addDoc, serverTimestamp, doc, updateDoc, getDoc 
} from 'firebase/firestore';
import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { auth } from '../../firebase-config';
import imageCompression from 'browser-image-compression'; 
import { ChatIcons } from './ChatIcons'; 
import './ChatWidget.css'; 

interface ChatRoom {
    id: string;
    participants: string[];
    lastMessage: string;
    updatedAt: any;
    unreadCount: number;
    siteName?: string;
    participantNames: string[];
    lastRead?: Record<string, any>;
    status?: string; // 'active' | 'closed'
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
    
    // --- [State] ---
    const [viewMode, setViewMode] = useState<'list' | 'room'>('list');
    const [chatRooms, setChatRooms] = useState<ChatRoom[]>([]);
    const [currentRoomId, setCurrentRoomId] = useState<string | null>(null);
    const [currentRoomName, setCurrentRoomName] = useState('');
    
    // [수정] currentRoomStatus 제거 (activeRoom에서 실시간 확인)

    const [messages, setMessages] = useState<Message[]>([]);
    const [inputText, setInputText] = useState('');
    
    const [isDrawerOpen, setIsDrawerOpen] = useState(false);
    const [drawerContent, setDrawerContent] = useState<'menu' | 'participants' | 'gallery'>('menu');
    const [participantsList, setParticipantsList] = useState<UserInfo[]>([]);
    
    const [isSearchMode, setIsSearchMode] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');

    const [showMeetingForm, setShowMeetingForm] = useState(false);
    const [meetingDate, setMeetingDate] = useState('');
    const [meetingTime, setMeetingTime] = useState('');
    const [meetingContent, setMeetingContent] = useState('');

    const [showEmojiPicker, setShowEmojiPicker] = useState(false); 
    const [isUploading, setIsUploading] = useState(false);
    const [userCache, setUserCache] = useState<Record<string, string>>({}); 
    
    const [position, setPosition] = useState({ x: window.innerWidth - 400 - 20, y: 80 });
    const [isDragging, setIsDragging] = useState(false);
    const dragStartPos = useRef({ x: 0, y: 0 });

    const messagesContainerRef = useRef<HTMLDivElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // [핵심] 현재 활성화된 채팅방 객체 (실시간 업데이트 반영됨)
    const activeRoom = useMemo(() => 
        chatRooms.find(r => r.id === currentRoomId), 
    [chatRooms, currentRoomId]);

    // --- [Helpers] ---
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

    // --- [Effects] ---
    const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
        if ((e.target as HTMLElement).closest('button')) return;
        setIsDragging(true);
        dragStartPos.current = { x: e.clientX - position.x, y: e.clientY - position.y };
    };

    useEffect(() => {
        const handleMouseMove = (e: MouseEvent) => {
            if (!isDragging) return;
            setPosition({ x: e.clientX - dragStartPos.current.x, y: e.clientY - dragStartPos.current.y });
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

    // --- [Actions] ---
    
    const sendMessage = async (text: string, type: 'text'|'image'|'meeting' = 'text', extraData: any = {}) => {
        if (!currentRoomId || !currentUser) return;
        
        // [수정] 실시간 activeRoom 상태 확인
        if (activeRoom?.status === 'closed') {
            alert("종료된 채팅방입니다.");
            return;
        }

        try {
            await addDoc(collection(db, 'chats', currentRoomId, 'messages'), {
                text, senderId: currentUser.uid, type, createdAt: serverTimestamp(), ...extraData
            });
            const lastMsgText = type === 'image' ? '(사진)' : type === 'meeting' ? '(일정 등록)' : text;
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
        if (!currentRoomId || !currentUser) return;
        if (activeRoom?.status === 'closed') return;

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
                siteId: currentRoomId, siteName: sName, 
                partnerUid: ownerUid, createdAt: serverTimestamp(), authorName: await getUserName(currentUser.uid)
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

    return (
        <div className="chat-widget-popup" style={{ left: position.x, top: position.y }}>
            <div className="chat-header" onMouseDown={handleMouseDown}>
                {viewMode === 'room' && (
                    <button className="btn-icon" onClick={() => { setViewMode('list'); setCurrentRoomId(null); }}>
                        <ChatIcons.Back />
                    </button>
                )}
                <h3 title={activeRoom?.siteName || "채팅"}>
                    {viewMode === 'list' ? '현장 채팅 목록' : (activeRoom?.siteName || '현장 채팅')}
                </h3>
                <div className="header-actions">
                    {viewMode === 'room' && (
                        <>
                            <button className="btn-icon" title="검색" onClick={() => setIsSearchMode(!isSearchMode)}><ChatIcons.Search /></button>
                            <button className="btn-icon" title="메뉴" onClick={() => { setIsDrawerOpen(true); setDrawerContent('menu'); }}><ChatIcons.Menu /></button>
                        </>
                    )}
                    <button className="btn-icon" onClick={onClose}><ChatIcons.Close /></button>
                </div>
            </div>

            <div className="chat-body">
                {viewMode === 'list' && (
                    <div className="chat-room-list">
                        {chatRooms.length === 0 ? <div className="no-chat">참여 중인 채팅방이 없습니다.</div> : 
                            chatRooms.map(room => {
                                const myReadTime = room.lastRead?.[currentUser?.uid || '']?.toMillis() || 0;
                                const updateTime = room.updatedAt?.toMillis() || 0;
                                const hasUnread = updateTime > myReadTime;
                                const isClosed = room.status === 'closed';
                                return (
                                    <div key={room.id} className={`chat-room-item ${isClosed ? 'closed' : ''}`} onClick={() => { 
                                        setCurrentRoomId(room.id); 
                                        setCurrentRoomName(room.siteName || '현장'); 
                                        // [수정] 상태는 activeRoom에서 가져오므로 여기선 setter 제거
                                        setViewMode('room'); 
                                    }}>
                                        <div className="room-avatar">
                                            <ChatIcons.Site />
                                            {hasUnread && <div className="room-badge" />}
                                        </div>
                                        <div className="room-info">
                                            <div className="room-name">
                                                {room.siteName}
                                                {hasUnread && <span className="new-badge">N</span>}
                                                {isClosed && <span className="closed-badge">종료</span>}
                                            </div>
                                            <div className="room-participants">{room.participantNames.join(', ')}</div>
                                            <div className={`room-last-msg ${hasUnread ? 'bold' : ''}`}>{room.lastMessage}</div>
                                        </div>
                                        <div className="room-date">{room.updatedAt?.toDate ? room.updatedAt.toDate().toLocaleDateString() : '-'}</div>
                                    </div>
                                );
                            })
                        }
                    </div>
                )}

                {viewMode === 'room' && (
                    <div className="chat-room-view">
                        {isSearchMode && (
                            <div className="search-bar-box">
                                <input autoFocus placeholder="대화 내용 검색..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
                                <button className="btn-icon" onClick={() => { setIsSearchMode(false); setSearchQuery(''); }}>취소</button>
                            </div>
                        )}
                        <div className="messages-area" ref={messagesContainerRef}>
                            {(isSearchMode ? filteredMessages : messages).map(msg => {
                                const isMe = msg.senderId === currentUser?.uid;
                                const isSystem = msg.type === 'system';
                                if (isSystem) return (<div key={msg.id} className="message-container system"><div className="message-bubble system" style={{whiteSpace:'pre-wrap'}}>{msg.text}</div></div>);
                                return (
                                    <div key={msg.id} className={`message-container ${isMe ? 'me' : 'other'}`}>
                                        {!isMe && <div className="sender-name">{msg.senderName}</div>}
                                        <div className={`message-bubble ${isMe ? 'me' : 'other'}`}>
                                            {msg.type === 'text' && <span className={isSearchMode && searchQuery && msg.text.includes(searchQuery) ? 'highlight' : ''}>{msg.text}</span>}
                                            {msg.type === 'image' && msg.imageUrl && <img src={msg.imageUrl} alt="첨부" className="message-image" onClick={() => window.open(msg.imageUrl, '_blank')} />}
                                            {msg.type === 'meeting' && (
                                                <div className="meeting-card">
                                                    <div className="meeting-header">📅 일정 등록</div>
                                                    <div className="meeting-info"><strong>일시:</strong> {msg.meetingDate} {msg.meetingTime}<br/><strong>내용:</strong> {msg.text}</div>
                                                </div>
                                            )}
                                            <div className="bubble-time">{msg.createdAt?.toDate ? msg.createdAt.toDate().toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'}) : ''}</div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>

                        {showMeetingForm && (
                            <div className="meeting-form">
                                <div style={{fontWeight:'bold', marginBottom:'5px'}}>📅 일정(약속) 등록</div>
                                <input type="date" value={meetingDate} onChange={e=>setMeetingDate(e.target.value)} />
                                <input type="time" value={meetingTime} onChange={e=>setMeetingTime(e.target.value)} />
                                <input type="text" placeholder="일정 내용" value={meetingContent} onChange={e=>setMeetingContent(e.target.value)} />
                                <div style={{display:'flex', gap:'5px', marginTop:'5px'}}>
                                    <button onClick={handleCreateMeeting} style={{flex:1}}>등록</button>
                                    <button onClick={() => setShowMeetingForm(false)} className="cancel" style={{flex:1}}>취소</button>
                                </div>
                            </div>
                        )}
                        {showEmojiPicker && (
                            <div className="emoji-picker-box">
                                {EMOJI_LIST.map(em => <span key={em} onClick={() => handleEmojiClick(em)}>{em}</span>)}
                                <button className="close-emoji" onClick={() => setShowEmojiPicker(false)}>×</button>
                            </div>
                        )}

                        {/* [수정] 실시간 activeRoom 상태로 체크 */}
                        {activeRoom?.status === 'closed' ? (
                            <div className="chat-closed-notice">🚫 공사가 완료되어 채팅이 종료되었습니다.</div>
                        ) : (
                            <form className="input-area" onSubmit={handleTextSubmit}>
                                <div className="input-row">
                                    <button type="button" className="btn-attach" title="사진" onClick={() => fileInputRef.current?.click()}><ChatIcons.Image /></button>
                                    <button type="button" className="btn-attach" title="일정" onClick={() => setShowMeetingForm(!showMeetingForm)}><ChatIcons.Calendar /></button>
                                    <button type="button" className="btn-attach" title="이모티콘" onClick={() => setShowEmojiPicker(!showEmojiPicker)}><ChatIcons.Emoji /></button>
                                </div>
                                <div className="input-row">
                                    <textarea 
                                        value={inputText} 
                                        onChange={e => setInputText(e.target.value)} 
                                        onKeyDown={handleKeyDown}
                                        onPaste={handlePaste} 
                                        placeholder="메시지 입력 (Shift+Enter 줄바꿈)" 
                                        rows={1}
                                        style={{resize:'none', minHeight:'38px', maxHeight:'100px'}}
                                    />
                                    <button type="submit" className="btn-send" disabled={isUploading}>{isUploading ? '...' : <ChatIcons.Send />}</button>
                                </div>
                                <input type="file" accept="image/*" ref={fileInputRef} style={{display:'none'}} onChange={handleFileChange} />
                            </form>
                        )}
                        {isUploading && <div className="uploading-overlay">전송 중...</div>}
                    </div>
                )}
            </div>

            <div className={`chat-drawer ${isDrawerOpen ? 'open' : ''}`}>
                <div className="drawer-header">
                    <span>{drawerContent === 'menu' ? '메뉴' : drawerContent === 'participants' ? '참여자 목록' : '사진 앨범'}</span>
                    <button className="btn-icon" onClick={() => { if(drawerContent === 'menu') setIsDrawerOpen(false); else setDrawerContent('menu'); }}><ChatIcons.Close /></button>
                </div>
                <div className="drawer-body">
                    {drawerContent === 'menu' && (
                        <>
                            <div className="drawer-menu-item" onClick={loadParticipants}><ChatIcons.User /> 대화 참여자</div>
                            <div className="drawer-menu-item" onClick={() => setDrawerContent('gallery')}><ChatIcons.Image /> 사진 앨범 ({galleryImages.length})</div>
                            <div className="drawer-menu-item" onClick={() => { setIsSearchMode(true); setIsDrawerOpen(false); }}><ChatIcons.Search /> 대화 내용 검색</div>
                        </>
                    )}
                    {drawerContent === 'participants' && (
                        <div className="participant-list">
                            {participantsList.map(p => (
                                <div key={p.uid} className="participant-item"><div className="p-avatar"><ChatIcons.User /></div><div>{p.name}</div></div>
                            ))}
                        </div>
                    )}
                    {drawerContent === 'gallery' && (
                        <div className="gallery-grid">
                            {galleryImages.map(img => (<img key={img.id} src={img.imageUrl} alt="gallery" className="gallery-img" onClick={() => window.open(img.imageUrl, '_blank')} />))}
                            {galleryImages.length === 0 && <p style={{fontSize:'12px', color:'#999', textAlign:'center'}}>공유된 사진이 없습니다.</p>}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default ChatWidget;