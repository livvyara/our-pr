// src/components/common/SuggestionDetailModal.tsx

import React, { useState, useEffect } from 'react';
import { 
  getFirestore, collection, addDoc, query, orderBy, onSnapshot, serverTimestamp, doc, updateDoc, deleteDoc 
} from 'firebase/firestore';
import type { CommunityPost } from '../../pages/community/CommunityBoardPage'; 
import './BoardModal.css'; 

interface Props {
  post: CommunityPost;
  currentUser: any;
  category: 'suggestion' | 'inquiry';
  isAdmin: boolean;
  onClose: (refresh?: boolean) => void;
}

const SuggestionDetailModal: React.FC<Props> = ({ post, currentUser, category, isAdmin, onClose }) => {
  const db = getFirestore();
  const [comments, setComments] = useState<any[]>([]);
  const [newComment, setNewComment] = useState('');
  
  const collectionName = category === 'inquiry' ? 'inquiryPosts' : 'suggestionPosts';

  // 댓글 불러오기
  useEffect(() => {
    const q = query(
      collection(db, collectionName, post.id, 'comments'),
      orderBy('createdAt', 'asc')
    );
    const unsubscribe = onSnapshot(q, (snap) => {
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setComments(list);
    });
    return () => unsubscribe();
  }, [db, post.id, collectionName]);

  // [⭐ 핵심 로직] 댓글 등록 및 상태 업데이트
  const handleAddComment = async () => {
    if (!newComment.trim()) return;
    try {
      // 1. 댓글 추가
      await addDoc(collection(db, collectionName, post.id, 'comments'), {
        content: newComment,
        authorName: isAdmin ? '관리자' : (currentUser.displayName || '사용자'),
        authorUid: currentUser.uid,
        isAdminComment: isAdmin, 
        createdAt: serverTimestamp()
      });

      // 2. 게시글 상태 업데이트 로직
      const postRef = doc(db, collectionName, post.id);
      const updateData: any = { commentCount: comments.length + 1 };

      // [관리자가 답변한 경우] -> 무조건 답변완료, 추가문의 해제
      if (isAdmin) {
          updateData.status = 'completed';
          updateData.hasAdditionalQuestion = false; 
      } 
      // [작성자가 추가 질문한 경우] -> 이미 완료된 상태였다면 '추가문의' 플래그 켬
      else if (currentUser.uid === post.authorUid) {
          if (post.status === 'completed') {
              updateData.hasAdditionalQuestion = true;
          }
      }

      await updateDoc(postRef, updateData);

      setNewComment('');
    } catch (e) {
      console.error(e);
      alert('댓글 등록 실패');
    }
  };

  const handleDelete = async () => {
    if(!confirm('정말 삭제하시겠습니까?')) return;
    try {
      await deleteDoc(doc(db, collectionName, post.id));
      alert('삭제되었습니다.');
      onClose(true);
    } catch (e) { console.error(e); }
  };

  // [⭐ 권한] 댓글 작성 가능 여부: 관리자 OR (이용문의 && 작성자 본인)
  // 기능제안(suggestion)은 기존대로 관리자만 답변 가능
  const canComment = isAdmin || (category === 'inquiry' && post.authorUid === currentUser.uid);

  return (
    <div className="board-modal-backdrop" onClick={() => onClose(false)}>
      <div className="board-modal-content detail-mode" onClick={e => e.stopPropagation()}>
        <div className="board-detail-header">
            <div className="detail-category-badge" style={{
                background: post.status==='completed'?'#1976d2':'#f57c00', color:'white'
            }}>
                {post.status === 'completed' ? '답변완료' : '답변대기'}
            </div>
            <h2 className="detail-title">{post.title}</h2>
            <div className="detail-meta">
                <span>작성자: {post.authorName}</span>
                <span className="divider">|</span>
                <span>{post.createdAt?.toDate ? post.createdAt.toDate().toLocaleString() : '-'}</span>
            </div>
        </div>

        <div className="board-detail-body ql-editor" 
             dangerouslySetInnerHTML={{ __html: post.content }}>
        </div>

        <div className="comment-section" style={{flex:1, display:'flex', flexDirection:'column', overflow:'hidden'}}>
            <h4 style={{margin:'0 0 10px 0'}}>댓글 / 답변</h4>
            
            <div style={{flex:1, overflowY:'auto', marginBottom:'10px', paddingRight:'5px'}}>
                {comments.map((c: any) => (
                    <div key={c.id} style={{
                        padding:'10px', borderRadius:'5px', marginBottom:'8px',
                        backgroundColor: c.isAdminComment ? '#f1f8ff' : '#f9f9f9',
                        border: c.isAdminComment ? '1px solid #c8e1ff' : '1px solid #eee'
                    }}>
                        <div style={{fontSize:'12px', fontWeight:'bold', marginBottom:'4px', color: c.isAdminComment?'#0366d6':'#555'}}>
                            {c.authorName} <span style={{fontWeight:'normal', color:'#999', marginLeft:'5px'}}>
                                {c.createdAt?.toDate().toLocaleString()}
                            </span>
                        </div>
                        <div style={{fontSize:'14px', whiteSpace:'pre-wrap'}}>{c.content}</div>
                    </div>
                ))}
                {comments.length === 0 && <p style={{color:'#999', fontSize:'13px'}}>등록된 답변이 없습니다.</p>}
            </div>

            {/* [⭐ 수정] 권한이 있는 사람만 입력창 표시 */}
            {canComment && (
                <div style={{display:'flex', gap:'10px'}}>
                    <input 
                        type="text" 
                        value={newComment}
                        onChange={e => setNewComment(e.target.value)}
                        placeholder={isAdmin ? "답변을 입력하세요..." : "추가 문의 내용을 입력하세요..."}
                        style={{flex:1, padding:'10px', borderRadius:'5px', border:'1px solid #ddd'}}
                        onKeyPress={e => e.key === 'Enter' && handleAddComment()}
                    />
                    <button 
                        onClick={handleAddComment}
                        style={{padding:'0 20px', background:'#333', color:'white', border:'none', borderRadius:'5px', cursor:'pointer'}}
                    >
                        등록
                    </button>
                </div>
            )}
        </div>

        <div className="board-modal-footer">
            {(isAdmin || post.authorUid === currentUser.uid) && (
                <button className="btn-delete-post" onClick={handleDelete}>삭제</button>
            )}
            <button className="btn-close" onClick={() => onClose(false)}>닫기</button>
        </div>
      </div>
    </div>
  );
};

export default SuggestionDetailModal;