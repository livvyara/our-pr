// src/components/common/BoardWriteModal.tsx

import React, { useState } from 'react';
import { getFirestore, collection, addDoc, serverTimestamp, doc, getDoc } from 'firebase/firestore';
import { auth } from '../../firebase-config';
import ReactQuill from 'react-quill-new';
import 'react-quill-new/dist/quill.snow.css';
import './BoardModal.css';

interface Props {
  category: 'notice' | 'update';
  onClose: (refresh: boolean) => void;
}

const BoardWriteModal: React.FC<Props> = ({ category, onClose }) => {
  const [title, setTitle] = useState('');
  const [content, setContent] = useState(''); // HTML 형태의 문자열
  const [isSubmitting, setIsSubmitting] = useState(false);
  const db = getFirestore();

  // 툴바 설정 (요청하신 기능 포함)
  const modules = {
    toolbar: [
      [{ 'size': ['small', false, 'large', 'huge'] }], // 글자 크기
      ['bold'], // 볼드체
      [{ 'color': [] }, { 'background': [] }], // 폰트 색상, 배경 색상
      [{ 'align': [] }], // 텍스트/이미지 정렬 (좌, 우, 중앙)
      ['image'], // 이미지 버튼
    ],
  };

  const handleSave = async () => {
    // 태그 제거 후 순수 텍스트만으로 공백 체크
    const textOnly = content.replace(/<[^>]+>/g, '').trim();
    if (!title.trim() || (!textOnly && !content.includes('<img'))) {
      alert('제목과 내용을 입력해주세요.');
      return;
    }

    if(!confirm('게시글을 등록하시겠습니까?')) return;

    setIsSubmitting(true);
    try {
      const user = auth.currentUser;
      let role = 'user';
      
      // 관리자 권한 확인 후 role 저장
      if (user) {
          const userDoc = await getDoc(doc(db, 'users', user.uid));
          if (userDoc.exists()) {
              role = userDoc.data().role || 'user';
          }
      }

      await addDoc(collection(db, 'adminPosts'), {
        title,
        content, // HTML 태그 포함 저장
        category,
        authorName: '관리자',
        authorUid: user?.uid,
        authorRole: role, // [중요] 작성자 등급 저장 (리스트 필터링용)
        createdAt: serverTimestamp(),
        viewCount: 0 // 조회수 초기화
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
          <h3>{category === 'notice' ? '공지사항' : '업데이트'} 등록</h3>
        </div>
        <div className="board-modal-body">
          <div className="board-form-group">
            <label>제목</label>
            <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="제목을 입력하세요" />
          </div>
          <div className="board-form-group full-height">
            <label>내용</label>
            {/* React Quill 에디터 */}
            <ReactQuill 
              theme="snow"
              value={content}
              onChange={setContent}
              modules={modules}
              placeholder="내용을 입력하세요. (이미지 붙여넣기 가능)"
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

export default BoardWriteModal;