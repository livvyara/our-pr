// src/components/common/SuggestionWriteModal.tsx

import React, { useState } from 'react';
import { getFirestore, collection, addDoc, serverTimestamp } from 'firebase/firestore';
import ReactQuill from 'react-quill-new';
import 'react-quill-new/dist/quill.snow.css';
import './BoardModal.css';

interface Props {
  user: any;
  category: 'suggestion' | 'inquiry'; // [⭐ 추가] 카테고리 구분
  onClose: (refresh: boolean) => void;
}

const SuggestionWriteModal: React.FC<Props> = ({ user, category, onClose }) => {
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const db = getFirestore();

  // 카테고리에 따른 설정
  const collectionName = category === 'inquiry' ? 'inquiryPosts' : 'suggestionPosts';
  const headerTitle = category === 'inquiry' ? '이용 문의하기' : '기능 제안하기';
  const placeholderTitle = category === 'inquiry' ? '문의하실 제목을 입력하세요' : '제안하실 기능의 제목을 입력하세요';

  const modules = {
    toolbar: [
      [{ 'align': [] }],
      ['image'],
      ['clean']
    ],
  };

  const handleSave = async () => {
    const textOnly = content.replace(/<[^>]+>/g, '').trim();
    if (!title.trim() || (!textOnly && !content.includes('<img'))) return alert('제목과 내용을 입력해주세요.');
    
    if(!confirm('글을 등록하시겠습니까?\n(등록된 글은 본인과 관리자만 볼 수 있습니다)')) return;

    setIsSubmitting(true);
    try {
      // [⭐ 수정] 동적 컬렉션 이름 사용
      await addDoc(collection(db, collectionName), {
        title,
        content,
        authorName: user.displayName || user.email?.split('@')[0] || '사용자',
        authorUid: user.uid,
        createdAt: serverTimestamp(),
        status: 'pending', 
        commentCount: 0,
        viewCount: 0,
        category: category // DB에도 카테고리 명시
      });
      
      alert('등록되었습니다.');
      onClose(true);
    } catch (e) {
      console.error(e);
      alert('등록 중 오류가 발생했습니다.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="board-modal-backdrop">
      <div className="board-modal-content write-mode">
        <div className="board-modal-header">
          <h3>{headerTitle}</h3>
        </div>
        <div className="board-modal-body">
          <div className="board-form-group">
            <label>제목</label>
            <input type="text" value={title} onChange={e => setTitle(e.target.value)} placeholder={placeholderTitle} />
          </div>
          <div className="board-form-group full-height">
            <label>내용</label>
            <ReactQuill 
              theme="snow"
              value={content}
              onChange={setContent}
              modules={modules}
              placeholder="상세 내용을 입력하세요. (이미지 붙여넣기 가능)"
              style={{ height: '300px', marginBottom: '50px' }}
            />
          </div>
        </div>
        <div className="board-modal-footer">
          <button className="btn-close" onClick={() => onClose(false)}>취소</button>
          <button className="btn-save" onClick={handleSave} disabled={isSubmitting}>등록</button>
        </div>
      </div>
    </div>
  );
};

export default SuggestionWriteModal;