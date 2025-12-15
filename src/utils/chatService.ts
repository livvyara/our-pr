import { getFirestore, collection, query, where, getDocs, doc, setDoc, serverTimestamp, getDoc, updateDoc, arrayUnion, addDoc } from 'firebase/firestore';

/**
 * 현장 채팅방 생성 또는 업데이트 함수 (기존 로직 유지)
 */
export const createOrUpdateSiteChat = async (
    siteId: string, 
    siteName: string, 
    partnerUid: string, 
    contractorUid?: string
) => {
    const db = getFirestore();

    try {
        let participants = [partnerUid];

        // 직원(Sub-partner) 추가 로직
        try {
            const q = query(
                collection(db, 'users'), 
                where('partnerInfo.ownerUid', '==', partnerUid),
                where('role', '==', 'sub_partner')
            );
            const querySnapshot = await getDocs(q);
            querySnapshot.forEach((doc) => {
                participants.push(doc.id); 
            });
        } catch (permError) {
            console.warn("[Chat] 직원 목록 조회 실패:", permError);
        }

        if (contractorUid) {
            participants.push(contractorUid);
        }

        participants = Array.from(new Set(participants));

        // [중요] 기존 'chats' 컬렉션 사용
        const chatRef = doc(db, 'chats', siteId);
        const chatSnap = await getDoc(chatRef);

        if (!chatSnap.exists()) {
            await setDoc(chatRef, {
                siteId: siteId,
                siteName: siteName,
                ownerUid: partnerUid,
                participants: participants, 
                lastMessage: '채팅방이 개설되었습니다.',
                updatedAt: serverTimestamp(),
                type: 'site_chat',
                status: 'active'
            });
            console.log(`[Chat] 신규 채팅방 생성 완료: ${siteName}`);
        } else {
            await updateDoc(chatRef, {
                participants: arrayUnion(...participants),
                siteName: siteName, 
            });
            console.log(`[Chat] 기존 채팅방 참여자 동기화 완료`);
        }

    } catch (error) {
        console.error("채팅방 생성/동기화 실패:", error);
    }
};

/**
 * [수정] 시스템 메시지 전송 (날짜 시간 포함)
 * 컬렉션: 'chats/{siteId}/messages'
 */
export const sendSystemMessage = async (siteId: string, message: string) => {
    const db = getFirestore();
    try {
        const chatRef = doc(db, 'chats', siteId);
        const chatSnap = await getDoc(chatRef);
        
        if (chatSnap.exists()) {
            // 날짜 포맷팅 (YYYY. MM. DD. 오전/오후 HH:mm)
            const now = new Date();
            const timeString = now.toLocaleString('ko-KR', {
                year: 'numeric',
                month: '2-digit',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit',
                hour12: true
            });

            const fullMessage = `${message}\n(${timeString})`;

            await addDoc(collection(db, 'chats', siteId, 'messages'), {
                text: fullMessage,
                senderId: 'system',
                type: 'system',
                createdAt: serverTimestamp()
            });

            await updateDoc(chatRef, {
                lastMessage: fullMessage,
                updatedAt: serverTimestamp()
            });
        } else {
            console.warn(`[Chat] 채팅방을 찾을 수 없습니다. (ID: ${siteId})`);
        }
    } catch (e) {
        console.error("시스템 메시지 전송 실패:", e);
    }
};

/**
 * 공사 완료 시 채팅방 마감 처리 (기존 로직 유지)
 */
export const closeSiteChat = async (siteId: string) => {
    const db = getFirestore();
    try {
        const chatRef = doc(db, 'chats', siteId);
        
        const closeMsg = `[공사 완료 안내]\n본 현장의 공사가 완료되어 채팅방이 비활성화됩니다.\n\nAS가 필요하실 경우 아래 링크를 통해 접수해 주세요.\n👉 AS 접수 바로가기\n https://ourproject.co.kr/as-request`;
        
        await addDoc(collection(db, 'chats', siteId, 'messages'), {
            text: closeMsg,
            senderId: 'system',
            type: 'system',
            createdAt: serverTimestamp()
        });

        await updateDoc(chatRef, {
            status: 'closed',
            lastMessage: '공사 완료로 인해 채팅이 종료되었습니다.',
            updatedAt: serverTimestamp()
        });

    } catch (e) {
        console.error("채팅방 마감 처리 실패:", e);
    }
};

/**
 * 채팅방 다시 활성화 (기존 로직 유지)
 */
export const openSiteChat = async (siteId: string) => {
    const db = getFirestore();
    try {
        const chatRef = doc(db, 'chats', siteId);
        
        await addDoc(collection(db, 'chats', siteId, 'messages'), {
            text: '[알림] 현장 상태가 변경되어 채팅방이 다시 활성화되었습니다.',
            senderId: 'system',
            type: 'system',
            createdAt: serverTimestamp()
        });

        await updateDoc(chatRef, {
            status: 'active',
            lastMessage: '채팅방이 다시 활성화되었습니다.',
            updatedAt: serverTimestamp()
        });

    } catch (e) {
        console.error("채팅방 활성화 실패:", e);
    }
};