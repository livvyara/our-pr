// src/components/partner/SiteFilesWidget.tsx

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { 
  getFirestore, 
  collection, 
  query, 
  where, 
  orderBy, 
  onSnapshot, 
  Timestamp,
  addDoc,
  serverTimestamp
} from 'firebase/firestore';
import { 
  getStorage, 
  ref, 
  uploadBytesResumable, 
  getDownloadURL 
} from 'firebase/storage';
// import { auth } from '../../firebase-config';
import './SiteFilesWidget.css'; 
import GalleryModal from './GalleryModal'; 

// Firestore 'files' 하위 컬렉션 문서 타입
interface FileEntry {
  id: string;
  url: string;
  name: string;
  category: string;
  createdAt: Timestamp;
}

interface SiteFilesWidgetProps {
  siteId: string;
  partnerUid: string;
  initialStatus: string;
}

// 1. 카테고리 정의 (키, 한글명)
const FILE_CATEGORIES = [
  { key: 'site-files', title: '현장 자료' },
  { key: 'client-request', title: '고객요청 디자인' },
  { key: 'floor-plan', title: '평면도' },
  { key: '3d-render', title: '3D 렌더링' }
];

const SiteFilesWidget: React.FC<SiteFilesWidgetProps> = ({ siteId, partnerUid }) => {
  const [allFiles, setAllFiles] = useState<FileEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const db = getFirestore();
  const storage = getStorage();

  const [isUploading, setIsUploading] = useState(false);
  // [⭐ 1. 수정] 업로드 진행률(숫자) -> 업로드 상태 메시지(문자열)
  const [uploadStatusMessage, setUploadStatusMessage] = useState('');
  const [uploadingCategoryKey, setUploadingCategoryKey] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedCategoryKey, setSelectedCategoryKey] = useState<string | null>(null);

  const [modalFiles, setModalFiles] = useState<FileEntry[] | null>(null);
  const [modalInitialIndex, setModalInitialIndex] = useState(0);

  // 2. (Realtime) 'files' 하위 컬렉션 구독
  useEffect(() => {
    if (!partnerUid || !siteId) return;
    const filesRef = collection(db, 'users', partnerUid, 'sites', siteId, 'files');
    const q = query(filesRef, orderBy("createdAt", "desc")); 

    setIsLoading(true);
    const unsubscribe = onSnapshot(q, (querySnapshot) => {
      const fileList: FileEntry[] = [];
      querySnapshot.forEach((doc) => {
        fileList.push({ id: doc.id, ...doc.data() } as FileEntry);
      });
      setAllFiles(fileList);
      setIsLoading(false);
    }, (error) => {
      console.error("파일 목록 구독 오류:", error);
      setIsLoading(false);
    });
    return () => unsubscribe();
  }, [db, siteId, partnerUid]);

  // 3. 카테고리별로 파일 분류 (useMemo로 최적화)
  const filesByCategory = useMemo(() => {
    const map = new Map<string, FileEntry[]>();
    for (const category of FILE_CATEGORIES) {
      map.set(category.key, []); 
    }
    for (const file of allFiles) {
      if (map.has(file.category)) {
        map.get(file.category)!.push(file);
      }
    }
    return map;
  }, [allFiles]);

  // 4. 자료등록 버튼 클릭 (개수 제한 체크)
  const handleUploadClick = (categoryKey: string) => {
    if (isUploading) return;
    
    const currentFiles = filesByCategory.get(categoryKey) || [];
    if (currentFiles.length >= 20) {
      alert("이 카테고리에는 최대 20개의 파일만 업로드할 수 있습니다.");
      return;
    }

    setSelectedCategoryKey(categoryKey); 
    fileInputRef.current?.click(); 
  };

  // 5. 썸네일 클릭 핸들러 (모달 열기)
  const handleThumbnailClick = (files: FileEntry[], categoryTitle: string, categoryKey: string) => {
    if (files.length === 0) {
      handleUploadClick(categoryKey); 
      return;
    }
    
    setModalFiles(files);
    setModalInitialIndex(0); 
  };

  // 6. 모달 닫기 핸들러
  const handleCloseModal = () => {
    setModalFiles(null);
  };

  // [⭐ 2. 수정] 다중 파일 업로드 로직 (순차 업로드)
  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0 || !selectedCategoryKey || !partnerUid || !siteId) {
      return;
    }

    const currentFiles = filesByCategory.get(selectedCategoryKey) || [];
    const totalCount = currentFiles.length + files.length;
    
    // (선택한 파일 + 기존 파일) 개수 제한
    if (totalCount > 20) {
      alert(`최대 20개까지 업로드할 수 있습니다.\n(현재 ${currentFiles.length}개, 선택 ${files.length}개, 총 ${totalCount}개)`);
      e.target.value = ""; // (input 초기화)
      return;
    }

    setIsUploading(true);
    setUploadingCategoryKey(selectedCategoryKey);
    
    const fileList = Array.from(files); // FileList를 배열로 변환
    const totalFiles = fileList.length;
    let successCount = 0;
    let failedCount = 0;

    // (한 번에 하나씩 순차적으로 업로드)
    for (let i = 0; i < totalFiles; i++) {
      const file = fileList[i];
      const fileIndex = i + 1;
      
      // (현재 파일 이름과 진행률 표시)
      setUploadStatusMessage(`(${fileIndex}/${totalFiles}) ${file.name.slice(0, 10)}...`);

      try {
        // (개별 파일 업로드 Promise)
        const uploadPromise = new Promise<void>((resolve, reject) => {
          const uniqueFileName = `${Date.now()}_${file.name}`;
          const storageRef = ref(storage, `users/${partnerUid}/sites/${siteId}/files/${uniqueFileName}`);
          const uploadTask = uploadBytesResumable(storageRef, file);

          uploadTask.on('state_changed',
            (snapshot) => {
              // (개별 파일 진행률 업데이트)
              const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
              setUploadStatusMessage(`(${fileIndex}/${totalFiles}) ${progress.toFixed(0)}%`);
            },
            (error) => {
              reject(error); // (try...catch 블록으로 에러 전송)
            },
            async () => {
              // (업로드 완료)
              try {
                const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
                await addFileToFirestore(file.name, downloadURL, selectedCategoryKey);
                resolve();
              } catch (dbError) {
                reject(dbError); // (try...catch 블록으로 에러 전송)
              }
            }
          );
        });

        await uploadPromise; // [⭐] 이 파일이 끝날 때까지 기다림
        successCount++;

      } catch (error) {
        console.error(`[${file.name}] 업로드 실패:`, error);
        failedCount++;
      }
    } // (for 루프 종료)

    setIsUploading(false);
    setUploadingCategoryKey(null);
    if (e.target) e.target.value = ""; // (input 값 초기화)

  };

  // 8. Firestore 문서 생성 헬퍼
  const addFileToFirestore = async (fileName: string, url: string, category: string) => {
    const filesRef = collection(db, 'users', partnerUid, 'sites', siteId, 'files');
    const newFileData = {
      name: fileName,
      url: url,
      category: category,
      createdAt: serverTimestamp(),
    };
    await addDoc(filesRef, newFileData);
  };


  if (isLoading) {
    return <p>자료 목록 로딩 중...</p>;
  }

  return (
    <>
      <div className="file-widget-container">
        <h3>자료 등록</h3>

        <input
          type="file"
          ref={fileInputRef}
          style={{ display: 'none' }}
          onChange={handleFileSelect}
          accept="image/*" // (이미지 파일만)
          multiple // [⭐ 3. 추가] 여러 파일 선택 가능
        />

        <ul className="file-category-list">
          {FILE_CATEGORIES.map(category => {
            const files = filesByCategory.get(category.key) || [];
            const thumbnailFile = files[0];
            const isThisCategoryUploading = uploadingCategoryKey === category.key;

            return (
              <li key={category.key} className="file-category-item">
                
                <div 
                  className="thumbnail-preview"
                  onClick={() => handleThumbnailClick(files, category.title, category.key)}
                  title={files.length > 0 ? "클릭해서 갤러리 보기" : "클릭해서 자료 등록"}
                >
                  {thumbnailFile ? (
                    <img src={thumbnailFile.url} alt={thumbnailFile.name} />
                  ) : (
                    <span>썸네일 없음</span>
                  )}
                </div>

                <div className="category-title-wrapper">
                  <h4 className="category-title">{category.title}</h4>
                  
                  <button 
                    className="add-file-button"
                    onClick={() => handleUploadClick(category.key)}
                    disabled={isUploading}
                  >
                    {/* [⭐ 4. 수정] 업로드 상태 메시지 표시 */}
                    {isThisCategoryUploading ? 
                      `업로드 중... ${uploadStatusMessage}` : 
                      "+ 자료등록"}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      </div>

      {/* 갤러리 모달 렌더링 */}
      {modalFiles && (
        <GalleryModal 
          files={modalFiles} 
          initialIndex={modalInitialIndex} 
          onClose={handleCloseModal}
        />
      )}
    </>
  );
};

export default SiteFilesWidget;