// src/components/admin/SupporterInfoChangeDetailModal.tsx

import React, { useState, useMemo } from 'react';
import { httpsCallable } from 'firebase/functions';
import './SupporterInfoChangeDetailModal.css'; // [수정]
import { Timestamp } from 'firebase/firestore'; 
import { auth, functions } from '../../firebase-config'; 

// (서포터 정보 인터페이스 - 파트너/셀러와 동일하다고 가정)
interface SupporterInfo {
  companyName: string;
  ceoName: string;
  businessNumber: string;
  city: string;
  district: string;
  addressDetail: string;
  contactName: string;
  contactPhone: string;
  file1Url: string; // 사업자등록증
  file2Url: string | null; // (예: 포트폴리오)
}
interface ChangeRequestData {
  uid: string; // 문서 ID
  userId: string; // 사용자 UID
  currentInfo: SupporterInfo; 
  requestedInfo: SupporterInfo; 
  status: 'pending' | 'approved' | 'rejected';
  newLicenseUrl?: string | null; // (신규 파일 2)
  newAttachmentUrls?: string[]; // (신규 파일 1 등)
  createdAt: Timestamp;
}
interface ModalProps {
  requestData: ChangeRequestData;
  onClose: (refresh: boolean) => void;
}

// (로그 생성용 한글명 맵 - 파트너/셀러와 동일하다고 가정)
const FIELD_NAMES: Record<string, string> = {
  companyName: "상호명",
  ceoName: "대표자명",
  businessNumber: "사업자 등록번호",
  city: "시/도",
  district: "시/군/구",
  addressDetail: "상세주소",
  contactName: "담당자명",
  contactPhone: "연락처",
};
const fieldKeys = Object.keys(FIELD_NAMES);


const SupporterInfoChangeDetailModal: React.FC<ModalProps> = ({ requestData, onClose }) => {
  const [isLoading, setIsLoading] = useState(false);
  const [rejectionReason, setRejectionReason] = useState('');

  // [파일 할당 state]
  const [assignedFile1Url, setAssignedFile1Url] = useState('keep');
  const [assignedFile2Url, setAssignedFile2Url] = useState('keep'); 

  // [신규 파일 목록]
  const newFileOptions = useMemo(() => {
    const options = [];
    if (requestData.newLicenseUrl) {
      options.push({
        url: requestData.newLicenseUrl,
        name: `(신규 파일 2) ${requestData.newLicenseUrl.split('%2F').pop()?.split('?')[0]}`
      });
    }
    if (requestData.newAttachmentUrls) {
      requestData.newAttachmentUrls.forEach((url, index) => {
        options.push({
          url: url,
          name: `(첨부파일 ${index + 1}) ${url.split('%2F').pop()?.split('?')[0]}`
        });
      });
    }
    return options;
  }, [requestData.newLicenseUrl, requestData.newAttachmentUrls]);


  // [⭐ 1. 수정] '승인' 버튼 로직 (서포터 함수 호출)
  const handleApprove = async () => {
    if (!window.confirm("정말로 이 정보 변경 요청을 '승인'하시겠습니까?")) {
      return;
    }
    
    setIsLoading(true);
    try {
      // [수정] 'approveSupporterInfoChange' 호출
      const approveFunction = httpsCallable(functions, 'approveSupporterInfoChange');
      
      const newData = {
        ...requestData.requestedInfo, 
      };
      
      // (파일 할당 드롭다운 로직)
      if (assignedFile1Url === 'keep') {
        newData.file1Url = requestData.currentInfo.file1Url;
      } else {
        newData.file1Url = assignedFile1Url;
      }
      if (assignedFile2Url === 'keep') {
        newData.file2Url = requestData.currentInfo.file2Url;
      } else {
        newData.file2Url = assignedFile2Url === 'none' ? null : assignedFile2Url;
      }

      await approveFunction({
        requestId: requestData.uid,
        userId: requestData.userId,
        newData: newData, 
        contactPhone: newData.contactPhone,
      });
      
      alert('정보 변경 승인 처리 및 문자 발송이 완료되었습니다.');
      onClose(true); // 목록 새로고침

    } catch (error: any) {
      alert(`승인 처리 중 오류가 발생했습니다: ${error.message}`);
      console.error(error);
      setIsLoading(false);
    }
  };

  // [⭐ 2. 수정] '부결' 버튼 로직 (서포터 함수 호출)
  const handleReject = async () => {
    if (!rejectionReason) { /* ... */ return; }
    if (!window.confirm("정말로 이 정보 변경 요청을 '부결'하시겠습니까?")) {
      return;
    }

    setIsLoading(true);
    try {
      // [수정] 'rejectSupporterInfoChange' 호출
      const rejectFunction = httpsCallable(functions, 'rejectSupporterInfoChange');
      
      await rejectFunction({
        requestId: requestData.uid,
        contactPhone: requestData.requestedInfo.contactPhone, 
        rejectionReason: rejectionReason, 
      });

      alert('정보 변경 부결 처리 및 문자 발송이 완료되었습니다.');
      onClose(true); // 목록 새로고침

    } catch (error: any) {
      alert(`부결 처리 중 오류가 발생했습니다: ${error.message}`);
      console.error(error);
      setIsLoading(false);
    }
  };


  return (
    <div className="modal-overlay" onClick={() => onClose(false)}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <h3>서포터(협력사) 정보 변경 신청 (승인/부결)</h3>
        
        {/* [Diff 테이블] */}
        <table className="diff-table">
          <thead>
            <tr>
              <th>항목</th>
              <th>변경 전 (Current)</th>
              <th>변경 후 (Requested)</th>
            </tr>
          </thead>
          <tbody>
            {/* 1. 텍스트 필드 렌더링 */}
            {fieldKeys.map(key => {
              const oldVal = (requestData.currentInfo as any)[key] || '';
              const newVal = (requestData.requestedInfo as any)[key] || '';
              const isChanged = oldVal !== newVal;
              
              return (
                <tr key={key}>
                  <th>{FIELD_NAMES[key]}</th>
                  <td className={isChanged ? 'old-value' : ''}>{oldVal}</td>
                  <td className={isChanged ? 'changed-value' : ''}>{newVal}</td>
                </tr>
              );
            })}
            
            {/* 2. 사업자 등록증 (file1) 렌더링 */}
            <tr>
              <th>사업자 등록증<br/>(필수)</th>
              <td>
                <a href={requestData.currentInfo.file1Url} target="_blank" rel="noopener noreferrer" className="detail-file-link">
                  기존 파일 보기
                </a>
              </td>
              <td>
                <select 
                  className="file-assignment-select"
                  value={assignedFile1Url}
                  onChange={(e) => setAssignedFile1Url(e.target.value)}
                >
                  <option value="keep">(변경 안 함) 기존 파일 유지</option>
                  {newFileOptions.map((file, i) => (
                    <option key={i} value={file.url}>{file.name}</option>
                  ))}
                </select>
              </td>
            </tr>

            {/* 3. 포트폴리오 (file2) 렌더링 */}
            <tr>
              <th>포트폴리오<br/>(선택)</th>
              <td>
                {requestData.currentInfo.file2Url ? (
                  <a href={requestData.currentInfo.file2Url} target="_blank" rel="noopener noreferrer" className="detail-file-link">
                    기존 파일 보기
                  </a>
                ) : (
                  <span className="detail-file-link optional">미첨부</span>
                )}
              </td>
              <td>
                <select 
                  className="file-assignment-select"
                  value={assignedFile2Url}
                  onChange={(e) => setAssignedFile2Url(e.target.value)}
                >
                  <option value="keep">(변경 안 함) 기존 파일/상태 유지</option>
                  {newFileOptions.map((file, i) => (
                    <option key={i} value={file.url}>{file.name}</option>
                  ))}
                  <option value="none" style={{ color: 'red' }}>(미첨부로 변경)</option>
                </select>
              </td>
            </tr>
          </tbody>
        </table>
        
        {/* [신규 첨부파일 목록 미리보기] */}
        {newFileOptions.length > 0 && (
          <div className="log-section"> {/* (로그 CSS 재사용) */}
            <h4>신청자가 첨부한 신규 파일 목록</h4>
            <ul className="new-attachments-list">
              {newFileOptions.map((file, i) => (
                 <li key={i}>
                   <a href={file.url} target="_blank" rel="noopener noreferrer" className="detail-file-link">
                     {file.name} (새 탭에서 보기)
                   </a>
                 </li>
              ))}
            </ul>
          </div>
        )}

        {/* --- 처리 영역 --- */}
        <div className="processing-section">
          <label htmlFor="rejectionReason" style={{ fontWeight: 'bold' }}>
            부결 사유 (부결 시 필수 입력)
          </label>
          <textarea
            id="rejectionReason"
            className="rejection-reason"
            placeholder="부결 처리 시 사유를 입력하세요."
            value={rejectionReason}
            onChange={(e) => setRejectionReason(e.target.value)}
            disabled={isLoading}
          />
          
          <div className="modal-actions">
            <button className="modal-button btn-cancel" onClick={() => onClose(false)} disabled={isLoading}>
              취소
            </button>
            <button 
              className="modal-button btn-reject" 
              onClick={handleReject}
              disabled={isLoading || !rejectionReason} 
            >
              부결
            </button>
            <button 
              className="modal-button btn-approve" 
              onClick={handleApprove} 
              disabled={isLoading}
            >
              승인
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SupporterInfoChangeDetailModal;