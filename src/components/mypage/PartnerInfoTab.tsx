// src/components/mypage/PartnerInfoTab.tsx

import React, { useState, type ChangeEvent } from 'react';
// [⭐ 1. 수정] Firebase 모듈 (setDoc, doc 추가)
import { getFirestore, collection, addDoc, serverTimestamp, doc, setDoc } from 'firebase/firestore';
import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { K_BRAND_COLOR } from '../../constants';
import './PartnerInfoTab.css'; 

// [ 대한민국 주소 데이터 (생략 없음) ]
const addressData: Record<string, string[]> = {
  '서울특별시': ['강남구', '강동구', '강북구', '강서구', '관악구', '광진구', '구로구', '금천구', '노원구', '도봉구', '동대문구', '동작구', '마포구', '서대문구', '서초구', '성동구', '성북구', '송파구', '양천구', '영등포구', '용산구', '은평구', '종로구', '중구', '중랑구'],
  '부산광역시': ['강서구', '금정구', '기장군', '남구', '동구', '동래구', '부산진구', '북구', '사상구', '사하구', '서구', '수영구', '연제구', '영도구', '중구', '해운대구'],
  '대구광역시': ['군위군', '남구', '달서구', '달성군', '동구', '북구', '서구', '수성구', '중구'],
  '인천광역시': ['강화군', '계양구', '남동구', '동구', '미추홀구', '부평구', '서구', '연수구', '옹진군', '중구'],
  '광주광역시': ['광산구', '남구', '동구', '북구', '서구'],
  '대전광역시': ['대덕구', '동구', '서구', '유성구', '중구'],
  '울산광역시': ['남구', '동구', '북구', '울주군', '중구'],
  '세종특별자치시': ['세종시'],
  '경기도': ['수원시', '성남시', '용인시', '고양시', '부천시', '안산시', '안양시', '남양주시', '화성시', '평택시', '의정부시', '시흥시', '파주시', '김포시', '광명시', '광주시', '군포시', '오산시', '이천시', '안성시', '하남시', '의왕시', '양주시', '구리시', '포천시', '동두천시', '과천시', '여주시', '양평군', '가평군', '연천군'],
  '강원특별자치도': ['춘천시', '원주시', '강릉시', '동해시', '태백시', '속초시', '삼척시', '홍천군', '횡성군', '영월군', '평창군', '정선군', '철원군', '화천군', '양구군', '인제군', '고성군', '양양군'],
  '충청북도': ['청주시', '충주시', '제천시', '보은군', '옥천군', '영동군', '증평군', '진천군', '괴산군', '음성군', '단양군'],
  '충청남도': ['천안시', '공주시', '보령시', '아산시', '서산시', '논산시', '계룡시', '당진시', '금산군', '부여군', '서천군', '청양군', '홍성군', '예산군', '태안군'],
  '전북특별자치도': ['전주시', '익산시', '군산시', '정읍시', '김제시', '남원시', '완주군', '고창군', '부안군', '임실군', '순창군', '장수군', '무주군', '진안군'],
  '전라남도': ['목포시', '여수시', '순천시', '나주시', '광양시', '담양군', '곡성군', '구례군', '고흥군', '보성군', '화순군', '장흥군', '강진군', '해남군', '영암군', '무안군', '함평군', '영광군', '장성군', '완도군', '진도군', '신안군'],
  '경상북도': ['포항시', '경주시', '김천시', '안동시', '구미시', '영주시', '영천시', '상주시', '문경시', '경산시', '의성군', '청송군', '영양군', '영덕군', '청도군', '고령군', '성주군', '칠곡군', '예천군', '봉화군', '울진군', '울릉군'],
  '경상남도': ['창원시', '김해시', '진주시', '양산시', '거제시', '통영시', '사천시', '밀양시', '함안군', '거창군', '창녕군', '고성군', '하동군', '합천군', '남해군', '함양군', '산청군', '의령군'],
  '제주특별자치도': ['제주시', '서귀포시']
};
const cityKeys = Object.keys(addressData);
const MAX_FILES = 5;
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

interface PartnerInfoTabProps {
  initialData: any; 
  userRole: string;
  userId: string;
  roleTabLabel: string; 
}

const PartnerInfoTab: React.FC<PartnerInfoTabProps> = ({ initialData, userRole, userId, roleTabLabel }) => {
  
  // 1. 폼 상태
  const [editData, setEditData] = useState({
    companyName: initialData.companyName || '',
    businessNumber: initialData.businessNumber || '',
    ceoName: initialData.ceoName || '',
    city: initialData.city || cityKeys[0],
    district: initialData.district || (addressData[initialData.city || cityKeys[0]]?.[0] || ''),
    addressDetail: initialData.addressDetail || '',
    contactName: initialData.contactName || '',
    contactPhone: initialData.contactPhone || '',
  });

  // 2. 신규 파일 상태
  const [newLicenseFile, setNewLicenseFile] = useState<File | null>(null); 
  const [newAttachments, setNewAttachments] = useState<File[]>([]); 
  
  const [isSubmitting, setIsSubmitting] = useState(false);

  // 3. 폼 입력 핸들러
  const handleChange = (e: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setEditData({
      ...editData,
      [e.target.name]: e.target.value,
    });
  };
  
  // 4. 시/도 변경 핸들러
  const handleCityChange = (e: ChangeEvent<HTMLSelectElement>) => {
    const newCity = e.target.value;
    const newDistricts = addressData[newCity] || [];
    setEditData({
      ...editData,
      city: newCity,
      district: newDistricts[0] || '' 
    });
  };
  
  const availableDistricts = addressData[editData.city] || [];

  // 5. 파일 유효성 검사 헬퍼
  const validateFile = (file: File): boolean => {
    if (!file.type.startsWith('image/') && file.type !== 'application/pdf') {
      alert(`파일 형식 오류: ${file.name}\n이미지(jpg, png) 또는 PDF 파일만 첨부 가능합니다.`);
      return false;
    }
    if (file.size > MAX_FILE_SIZE) {
      alert(`파일 크기 초과: ${file.name} (최대 10MB)`);
      return false;
    }
    return true;
  };
  
  // 6. 신규 면허증 핸들러
  const handleNewLicenseChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      if (validateFile(file)) {
        setNewLicenseFile(file);
      }
      e.target.value = ''; 
    }
  };

  // 7. 기타 첨부파일 핸들러 (다중)
  const handleMultiFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return;
    
    const files = Array.from(e.target.files);
    const validFiles: File[] = [];

    for (const file of files) {
      if (newAttachments.length + validFiles.length >= MAX_FILES) {
        alert(`최대 ${MAX_FILES}개까지만 첨부할 수 있습니다.`);
        break;
      }
      if (validateFile(file)) {
        validFiles.push(file);
      }
    }
    setNewAttachments(prev => [...prev, ...validFiles]);
    e.target.value = ''; 
  };

  // 8. 기타 첨부파일 삭제
  const handleRemoveFile = (fileName: string) => {
    setNewAttachments(prev => prev.filter(file => file.name !== fileName));
  };


  // [⭐ 9. 수정] "정보 수정 요청" 제출 (동적 경로 적용)
  const handleSubmitRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!window.confirm("정보 수정을 요청하시겠습니까? 관리자 승인 후 반영됩니다.")) {
      return;
    }
    
    setIsSubmitting(true);
    const db = getFirestore();
    const storage = getStorage();

    // [⭐ 9-1. 수정] userRole에 따라 동적으로 경로/컬렉션 이름 설정
    let collectionName = '';
    let storagePath = '';
    
    if (userRole === 'partner') {
      collectionName = 'partnerInfoChangeRequests';
      storagePath = 'partner-info-requests';
    } else if (userRole === 'seller') {
      collectionName = 'sellerInfoChangeRequests';
      storagePath = 'seller-info-requests';
    } else if (userRole === 'contract') {
      collectionName = 'supporterInfoChangeRequests';
      storagePath = 'supporter-info-requests';
    } else {
      alert('알 수 없는 사용자 역할입니다.');
      setIsSubmitting(false);
      return;
    }

    // [⭐ 9-2. 수정] 새 요청을 위한 고유 ID 미리 생성 (동적 컬렉션 이름 사용)
    const requestDocRef = doc(collection(db, collectionName));
    const requestId = requestDocRef.id;

    try {
      // --- 3. 파일 업로드 (동적 Storage 경로 사용) ---
      let newLicenseUrl: string | null = null;
      if (newLicenseFile) {
        // [수정] 동적 storagePath 사용
        const licenseRef = ref(storage, `${storagePath}/${userId}/${requestId}/new_license_${newLicenseFile.name}`);
        await uploadBytes(licenseRef, newLicenseFile);
        newLicenseUrl = await getDownloadURL(licenseRef);
      }
      
      const newAttachmentUrls: string[] = [];
      for (const file of newAttachments) {
        // [수정] 동적 storagePath 사용
        const attachmentRef = ref(storage, `${storagePath}/${userId}/${requestId}/attachments/${file.name}`);
        await uploadBytes(attachmentRef, file);
        const url = await getDownloadURL(attachmentRef);
        newAttachmentUrls.push(url);
      }

      // --- 4. Firestore 문서 생성 (동적 컬렉션 이름 사용) ---
      // [수정] addDoc -> setDoc (미리 생성한 ID 사용)
      await setDoc(requestDocRef, { 
        userId: userId,
        userRole: userRole,
        currentInfo: initialData, 
        requestedInfo: editData,
        newLicenseUrl: newLicenseUrl,
        newAttachmentUrls: newAttachmentUrls,
        status: 'pending',
        createdAt: serverTimestamp(),
      });

      alert('정보 수정 요청이 정상적으로 접수되었습니다.');
      setNewLicenseFile(null);
      setNewAttachments([]);

    } catch (error) {
      alert('수정 요청 중 오류가 발생했습니다.');
      console.error(error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="partner-info-tab">
      <h3 className="form-label">{roleTabLabel} 수정</h3>
      
      <form onSubmit={handleSubmitRequest}>
        <div className="form-group">
          <label className="form-label">상호명</label>
          <input type="text" name="companyName" className="form-input" value={editData.companyName} onChange={handleChange} />
        </div>

        <div className="form-group">
          <label className="form-label">사업자 등록번호</label>
          <input type="text" name="businessNumber" className="form-input" value={editData.businessNumber} onChange={handleChange} />
        </div>

        <div className="form-group">
          <label className="form-label">대표자명</label>
          <input type="text" name="ceoName" className="form-input" value={editData.ceoName} onChange={handleChange} />
        </div>

        {/* 소재지 */}
        <div className="location-row">
          <div className="form-group">
            <label className="form-label">시/도</label>
            <select name="city" className="form-select" value={editData.city} onChange={handleCityChange}>
              {cityKeys.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">시/군/구</label>
            <select name="district" className="form-select" value={editData.district} onChange={handleChange}>
              {availableDistricts.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>
        </div>
        <div className="form-group">
          <label className="form-label">상세주소</label>
          <input type="text" name="addressDetail" className="form-input" value={editData.addressDetail} onChange={handleChange} />
        </div>

        {/* 파일 (읽기 전용/미리보기) */}
        <div className="form-group">
          <label className="form-label">사업자 등록증</label>
          <div className="file-field-group">
            <a href={initialData.file1Url} target="_blank" rel="noopener noreferrer" className="form-file-link">
              (필수) 기존 파일 보기
            </a>
          </div>
        </div>
        
        {/* 면허증 (조건부 렌더링) */}
        <div className="form-group">
          <label className="form-label">
            {userRole === 'seller' ? '통신판매업신고증' : '실내건축 면허증'}
          </label>
          <div className="file-field-group">
            {initialData.file2Url && (
              <a href={initialData.file2Url} target="_blank" rel="noopener noreferrer" className="form-file-link">
                (기존) 파일 보기
              </a>
            )}
            
            {/* 1. 기존 면허증이 없고, 새 면허증도 첨부 안됐을 때 -> 첨부 버튼 */}
            {!initialData.file2Url && !newLicenseFile && (
              <input 
                type="file" 
                className="conditional-file-upload" 
                onChange={handleNewLicenseChange}
                accept="image/*,application/pdf"
              />
            )}
            
            {/* 2. 새 면허증이 첨부되었을 때 -> 파일 이름 표시 */}
            {newLicenseFile && (
              <span className="form-file-link optional">(신규) {newLicenseFile.name}</span>
            )}
          </div>
        </div>


        <div className="form-group">
          <label className="form-label">담당자명</label>
          <input type="text" name="contactName" className="form-input" value={editData.contactName} onChange={handleChange} />
        </div>

        <div className="form-group">
          <label className="form-label">연락처</label>
          <input type="tel" name="contactPhone" className="form-input" value={editData.contactPhone} onChange={handleChange} />
        </div>

        {/* 다중 파일 첨부 영역 */}
        <div className="form-group">
          <div className="multi-file-upload-area">
            <label htmlFor="multi-file">기타 첨부파일 (선택, 최대 5개)</label>
            <input 
              type="file" 
              id="multi-file"
              className="form-file-input"
              multiple
              onChange={handleMultiFileChange}
              accept="image/*,application/pdf"
              disabled={newAttachments.length >= MAX_FILES}
            />
            {/* 파일 목록 */}
            {newAttachments.length > 0 && (
              <ul className="file-preview-list">
                {newAttachments.map(file => (
                  <li key={file.name} className="file-preview-item">
                    <span>{file.name}</span>
                    <button 
                      type="button" 
                      className="file-remove-button"
                      onClick={() => handleRemoveFile(file.name)}
                    >
                      X
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
        {/* 캡션 */}
        <p className="form-caption">
          * 상호명/대표자명/주소 변경시 사업자등록증 및 사업자등록증명원을 첨부해야 합니다.
        </p>


        <button 
          type="submit" 
          className="submit-button" 
          style={{ backgroundColor: K_BRAND_COLOR }}
          disabled={isSubmitting}
        >
          {isSubmitting ? '요청 중...' : '정보 수정 요청하기'}
        </button>
      </form>
    </div>
  );
};

export default PartnerInfoTab;