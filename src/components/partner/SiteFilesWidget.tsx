import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  getFirestore, collection, query, orderBy, onSnapshot, Timestamp, addDoc, serverTimestamp
} from 'firebase/firestore';
import { getStorage, ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import './SiteFilesWidget.css'; 
import GalleryModal from './GalleryModal'; 

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
  const [uploadStatusMessage, setUploadStatusMessage] = useState('');
  const [uploadingCategoryKey, setUploadingCategoryKey] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedCategoryKey, setSelectedCategoryKey] = useState<string | null>(null);

  const [modalFiles, setModalFiles] = useState<FileEntry[] | null>(null);
  const [modalInitialIndex, setModalInitialIndex] = useState(0);

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

  const filesByCategory = useMemo(() => {
    const map = new Map<string, FileEntry[]>();
    for (const category of FILE_CATEGORIES) { map.set(category.key, []); }
    for (const file of allFiles) {
      if (map.has(file.category)) { map.get(file.category)!.push(file); }
    }
    return map;
  }, [allFiles]);

  const handleUploadClick = (categoryKey: string) => {
    if (isUploading) return;
    const currentFiles = filesByCategory.get(categoryKey) || [];
    if (currentFiles.length >= 20) { alert("이 카테고리에는 최대 20개의 파일만 업로드할 수 있습니다."); return; }
    setSelectedCategoryKey(categoryKey); 
    fileInputRef.current?.click(); 
  };

  const handleThumbnailClick = (files: FileEntry[], categoryTitle: string, categoryKey: string) => {
    if (files.length === 0) { handleUploadClick(categoryKey); return; }
    setModalFiles(files);
    setModalInitialIndex(0); 
  };

  const handleCloseModal = () => { setModalFiles(null); };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0 || !selectedCategoryKey || !partnerUid || !siteId) return;

    const currentFiles = filesByCategory.get(selectedCategoryKey) || [];
    const totalCount = currentFiles.length + files.length;
    
    if (totalCount > 30) {
      alert(`최대 30개까지 업로드할 수 있습니다.`);
      e.target.value = ""; return;
    }

    setIsUploading(true);
    setUploadingCategoryKey(selectedCategoryKey);
    
    const fileList = Array.from(files); 
    const totalFiles = fileList.length;

    for (let i = 0; i < totalFiles; i++) {
      const file = fileList[i];
      const fileIndex = i + 1;
      setUploadStatusMessage(`(${fileIndex}/${totalFiles})`);

      try {
        const uploadPromise = new Promise<void>((resolve, reject) => {
          const uniqueFileName = `${Date.now()}_${file.name}`;
          const storageRef = ref(storage, `users/${partnerUid}/sites/${siteId}/files/${uniqueFileName}`);
          const uploadTask = uploadBytesResumable(storageRef, file);

          uploadTask.on('state_changed',
            (snapshot) => {
              // const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
            },
            (error) => reject(error),
            async () => {
              try {
                const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
                await addFileToFirestore(file.name, downloadURL, selectedCategoryKey);
                resolve();
              } catch (dbError) { reject(dbError); }
            }
          );
        });
        await uploadPromise; 
      } catch (error) { console.error(`[${file.name}] 업로드 실패:`, error); }
    } 

    setIsUploading(false);
    setUploadingCategoryKey(null);
    setUploadStatusMessage('');
    if (e.target) e.target.value = ""; 
  };

  const addFileToFirestore = async (fileName: string, url: string, category: string) => {
    const filesRef = collection(db, 'users', partnerUid, 'sites', siteId, 'files');
    await addDoc(filesRef, { name: fileName, url: url, category: category, createdAt: serverTimestamp() });
  };

  if (isLoading) return <p className="file-loading">자료 목록 로딩 중...</p>;

  return (
    <div className="file-widget-container">
      <div className="file-header-row">
        <h3>자료 등록</h3>
      </div>

      <input type="file" ref={fileInputRef} style={{ display: 'none' }} onChange={handleFileSelect} accept="image/*" multiple />
      
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
                    <>
                        <img src={thumbnailFile.url} alt={thumbnailFile.name} />
                        <div className="thumbnail-overlay" />
                    </>
                ) : (
                    <span>No Image</span>
                )}
              </div>
              
              <div className="category-info-wrapper">
                <h4 className="category-title">{category.title} <span style={{fontSize:'11px', color:'#999', fontWeight:'normal'}}>({files.length})</span></h4>
                
                {isThisCategoryUploading ? (
                    <span className="uploading-text">업로드 중 {uploadStatusMessage}</span>
                ) : (
                    <button className="add-file-button" onClick={() => handleUploadClick(category.key)} disabled={isUploading}>
                      + 추가
                    </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      
      {modalFiles && (
        <GalleryModal 
          files={modalFiles} 
          initialIndex={modalInitialIndex} 
          onClose={handleCloseModal}
          siteId={siteId}
          partnerUid={partnerUid}
        />
      )}
    </div>
  );
};

export default SiteFilesWidget;