// src/components/common/BoardDetailModal.tsx

import React, { useState } from 'react';
import { getFirestore, doc, deleteDoc, updateDoc } from 'firebase/firestore';
import { type CommunityPost } from '../../pages/community/CommunityBoardPage';
import ReactQuill from 'react-quill-new'; 
import 'react-quill-new/dist/quill.snow.css';
import './BoardModal.css';

interface Props {
  post: CommunityPost;
  onClose: (refresh?: boolean) => void; 
  isAdmin: boolean;
  onDeleteSuccess: () => void;
}

const timestampToDateString = (ts: any) => {
  if (!ts) return '-';
  const date = ts.toDate ? ts.toDate() : new Date(ts);
  return date.toLocaleString();
};

const BoardDetailModal: React.FC<Props> = ({ post, onClose, isAdmin, onDeleteSuccess }) => {
  const db = getFirestore();

  // --- 상태 관리 ---
  const [isEditing, setIsEditing] = useState(false); 
  const [isSaving, setIsSaving] = useState(false);
  const [zoomedImage, setZoomedImage] = useState<string | null>(null); 

  // 수정용 데이터
  const [editData, setEditData] = useState({
    title: post.title,
    content: post.content,
    authorName: post.authorName,
    viewCount: post.viewCount || 0,
  });

  // 1. 삭제 핸들러
  const handleDelete = async () => {
    if (!confirm('정말 이 게시글을 삭제하시겠습니까?')) return;
    try {
      await deleteDoc(doc(db, 'adminPosts', post.id));
      alert('삭제되었습니다.');
      onDeleteSuccess();
      onClose(true);
    } catch (e) {
      console.error(e);
      alert('삭제 실패');
    }
  };

  // 2. 수정 저장 핸들러
  const handleUpdate = async () => {
    if (!editData.title.trim()) return alert('제목을 입력해주세요.');
    if (!confirm('수정사항을 저장하시겠습니까?')) return;

    setIsSaving(true);
    try {
      const postRef = doc(db, 'adminPosts', post.id);
      await updateDoc(postRef, {
        title: editData.title,
        content: editData.content,
        authorName: editData.authorName,
        viewCount: Number(editData.viewCount), 
      });

      alert('수정되었습니다.');
      onClose(true); 
    } catch (e) {
      console.error(e);
      alert('수정 중 오류가 발생했습니다.');
    } finally {
      setIsSaving(false);
    }
  };

  // 3. 이미지 클릭 감지 (확대)
  const handleContentClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    if (target.tagName === 'IMG') {
      setZoomedImage((target as HTMLImageElement).src);
    }
  };

  // 4. 입력 핸들러
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setEditData(prev => ({ ...prev, [name]: value }));
  };

  // 5. 에디터 모듈
  const modules = {
    toolbar: [
      [{ 'header': [1, 2, false] }],
      ['bold', 'italic', 'underline', 'strike'],
      [{ 'color': [] }, { 'background': [] }],
      [{ 'align': [] }],
      ['image', 'link'],
      ['clean']
    ],
  };

  return (
    <div className="board-modal-backdrop" onClick={() => onClose(false)}>
      <div className="board-modal-content detail-mode" onClick={(e) => e.stopPropagation()}>
        
        {/* --- [헤더 영역] --- */}
        <div className="board-detail-header">
          <div className="detail-header-top">
            <div className="detail-category-badge">
              {post.category === 'notice' ? '공지사항' : '업데이트'}
            </div>
            
            <button className="btn-icon-close" onClick={() => onClose(false)}>&times;</button>
          </div>

          {isEditing ? (
            <input 
              type="text" 
              name="title"
              className="edit-input-title"
              value={editData.title} 
              onChange={handleChange}
              placeholder="제목"
            />
          ) : (
            <h2 className="detail-title">{post.title}</h2>
          )}

          <div className="detail-meta">
            {isEditing ? (
              <div className="edit-meta-row">
                <label>작성자: <input type="text" name="authorName" value={editData.authorName} onChange={handleChange} className="edit-input-meta" /></label>
                <span className="divider">|</span>
                <span>{timestampToDateString(post.createdAt)}</span>
                <span className="divider">|</span>
                <label>조회수: <input type="number" name="viewCount" value={editData.viewCount} onChange={handleChange} className="edit-input-meta" /></label>
              </div>
            ) : (
              <>
                <span>작성자: {post.authorName}</span>
                <span className="divider">|</span>
                <span>{timestampToDateString(post.createdAt)}</span>
                <span className="divider">|</span>
                <span>조회 {post.viewCount || 0}</span>
              </>
            )}
          </div>
        </div>

        {/* --- [본문 영역] --- */}
        <div className="board-detail-body">
          {isEditing ? (
            <ReactQuill 
              theme="snow"
              value={editData.content}
              onChange={(val) => setEditData(prev => ({...prev, content: val}))}
              modules={modules}
              style={{ height: '400px', marginBottom: '50px' }}
            />
          ) : (
            <div 
              className="ql-editor view-content"
              onClick={handleContentClick}
              dangerouslySetInnerHTML={{ __html: post.content }}
            />
          )}
        </div>

        {/* --- [푸터 버튼 영역] --- */}
        <div className="board-modal-footer">
          {isAdmin && (
            <>
              {isEditing ? (
                <>
                  <button className="btn-cancel" onClick={() => setIsEditing(false)}>취소</button>
                  <button className="btn-save" onClick={handleUpdate} disabled={isSaving}>
                    {isSaving ? '저장 중...' : '저장 완료'}
                  </button>
                </>
              ) : (
                <>
                  <div className="left-actions">
                    <button className="btn-delete-post" onClick={handleDelete}>삭제</button>
                  </div>
                  <div className="right-actions">
                    <button className="btn-edit-post" onClick={() => setIsEditing(true)}>수정</button>
                    <button className="btn-close" onClick={() => onClose(false)}>닫기</button>
                  </div>
                </>
              )}
            </>
          )}
          {!isAdmin && (
             <button className="btn-close" onClick={() => onClose(false)}>닫기</button>
          )}
        </div>

      </div>

      {/* [이미지 확대 모달] */}
      {zoomedImage && (
        <div 
          className="image-zoom-backdrop" 
          onClick={(e) => {
            // [⭐ 중요] 이벤트 전파 중단 (부모의 onClose 실행 방지)
            e.stopPropagation();
            setZoomedImage(null);
          }}
        >
          <img 
            src={zoomedImage} 
            alt="확대" 
            onClick={(e) => e.stopPropagation()} 
          />
          <button 
            className="btn-zoom-close" 
            onClick={(e) => {
              // [⭐ 중요] 닫기 버튼 클릭 시에도 전파 중단
              e.stopPropagation();
              setZoomedImage(null);
            }}
          >
            &times;
          </button>
        </div>
      )}
    </div>
  );
};

export default BoardDetailModal;