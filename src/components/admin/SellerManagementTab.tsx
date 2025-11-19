// src/components/admin/SellerManagementTab.tsx

import React, { useState, useEffect, useCallback } from 'react';
import { getFirestore, collection, getDocs, query, where, Timestamp, orderBy } from 'firebase/firestore';
import './SellerManagementTab.css';
import SellerApplicationDetailModal from './SellerApplicationDetailModal';
import SellerInfoChangeDetailModal from './SellerInfoChangeDetailModal'; 

// [ 인터페이스 정의 (셀러) ]
interface LogEntry {
  timestamp: Timestamp;
  log: string;
}
interface ApplicationData {
  uid: string; // 문서 ID
  userId: string; // 신청한 유저의 UID
  companyName: string;
  ceoName: string;
  businessNumber: string;
  city: string;
  district: string;
  addressDetail: string;
  contactName: string;
  contactPhone: string;
  file1Url: string; 
  file2Url: string | null;
  status: 'pending' | 'approved' | 'rejected';
  createdAt: Timestamp;
  changeHistory?: LogEntry[]; 
}
interface ChangeRequestData {
  uid: string; // 문서 ID
  userId: string; // 사용자 UID
  currentInfo: any;
  requestedInfo: any;
  status: 'pending' | 'approved' | 'rejected';
  newLicenseUrl?: string | null;
  newAttachmentUrls?: string[];
  createdAt: Timestamp;
}

// (Timestamp 포맷 함수)
const timestampToDateString = (ts: Timestamp | null | undefined): string => {
  if (!ts) return '';
  return ts.toDate().toISOString().split('T')[0];
};

// Props 정의
interface SellerManagementTabProps {
  pendingCount: number;
  infoChangeCount: number;
}

const SellerManagementTab: React.FC<SellerManagementTabProps> = ({ pendingCount, infoChangeCount }) => {
  // 1. 3개의 메인 탭 상태
  const [activeTab, setActiveTab] = useState('main'); 
  
  // [⭐ 1. 수정] 하위 탭 상태 2종류
  const [activeNewAppSubTab, setActiveNewAppSubTab] = useState('pending'); // 신규 신청용
  const [activeInfoChangeSubTab, setActiveInfoChangeSubTab] = useState('pending'); // 정보 변경용

  // 2. 목록 state
  const [applications, setApplications] = useState<ApplicationData[]>([]);
  const [changeRequests, setChangeRequests] = useState<ChangeRequestData[]>([]); 
  const [isLoading, setIsLoading] = useState(false);
  const [selectedApp, setSelectedApp] = useState<ApplicationData | null>(null);
  const [selectedChangeRequest, setSelectedChangeRequest] = useState<ChangeRequestData | null>(null); 

  const db = getFirestore();

  // '신규 신청' 목록
  const fetchSellerApplications = useCallback(async (status: string) => {
    setIsLoading(true);
    const appCollectionRef = collection(db, "sellerApplications");
    const q = query(appCollectionRef, where("status", "==", status), orderBy("createdAt", "desc"));
    const querySnapshot = await getDocs(q);
    const appList: ApplicationData[] = [];
    querySnapshot.forEach((doc) => {
      appList.push({ uid: doc.id, ...doc.data() } as ApplicationData);
    });
    setApplications(appList);
    setIsLoading(false);
  }, [db]); 

  // [⭐ 2. 수정] '정보 변경' 목록
  const fetchSellerChangeRequests = useCallback(async (status: string) => {
    setIsLoading(true);
    const reqCollectionRef = collection(db, "sellerInfoChangeRequests");
    const q = query(reqCollectionRef, where("status", "==", status), orderBy("createdAt", "desc"));
    const querySnapshot = await getDocs(q);
    const reqList: ChangeRequestData[] = [];
    querySnapshot.forEach((doc) => {
      reqList.push({ uid: doc.id, ...doc.data() } as ChangeRequestData);
    });
    setChangeRequests(reqList);
    setIsLoading(false);
  }, [db]);

  // [⭐ 3. 수정] useEffect (탭 분기)
  useEffect(() => {
    if (activeTab === 'newApplications') {
      fetchSellerApplications(activeNewAppSubTab);
    } else if (activeTab === 'infoChange') {
      fetchSellerChangeRequests(activeInfoChangeSubTab);
    } else {
      setIsLoading(false);
    }
  }, [activeTab, activeNewAppSubTab, activeInfoChangeSubTab, fetchSellerApplications, fetchSellerChangeRequests]);

  // [⭐ 4. 수정] 모달 핸들러 (2종류)
  const handleViewDetails = (app: ApplicationData) => setSelectedApp(app);
  const handleCloseModal = (refresh: boolean) => {
    setSelectedApp(null);
    if (refresh) fetchSellerApplications(activeNewAppSubTab); 
  };
  
  const handleViewChangeDetails = (req: ChangeRequestData) => setSelectedChangeRequest(req);
  const handleCloseChangeModal = (refresh: boolean) => {
    setSelectedChangeRequest(null);
    if (refresh) fetchSellerChangeRequests(activeInfoChangeSubTab);
  };


  // 5-A. "셀러 관리" (메인 탭) 렌더링
  const renderMainTab = () => (
    <div className="seller-tab-content">
      <h3>셀러 관리 (메인)</h3>
      <p>기존 셀러들의 정보를 관리하는 서브메뉴입니다. (미구현)</p>
      <ul className="unimplemented-submenu">
        {/* ... (미구현 목록) ... */}
      </ul>
    </div>
  );

  // 5-B. "신규 셀러 신청 관리" 탭 렌더링
  const renderNewApplicationsTab = () => (
    <div className="seller-tab-content">
      
      {/* 6-1. 하위 탭 버튼들 */}
      <div className="seller-sub-tabs">
        <button
          className={`seller-sub-tab-button ${activeNewAppSubTab === 'pending' ? 'active' : ''}`}
          onClick={() => setActiveNewAppSubTab('pending')}
        >
          신청 목록
        </button>
        <button
          className={`seller-sub-tab-button ${activeNewAppSubTab === 'approved' ? 'active' : ''}`}
          onClick={() => setActiveNewAppSubTab('approved')}
        >
          승인 내역
        </button>
        <button
          className={`seller-sub-tab-button ${activeNewAppSubTab === 'rejected' ? 'active' : ''}`}
          onClick={() => setActiveNewAppSubTab('rejected')}
        >
          부결 내역
        </button>
      </div>
      
      {/* 6-2. 하위 탭 제목 */}
      <h3>
        {activeNewAppSubTab === 'pending' && '신규 셀러 신청 목록'}
        {activeNewAppSubTab === 'approved' && '셀러 승인 내역'}
        {activeNewAppSubTab === 'rejected' && '셀러 부결 내역'}
      </h3>
      {/* ... (p 태그) ... */}

      {/* 6-3. 목록 테이블 */}
      {isLoading && <p>신청 목록을 불러오는 중입니다...</p>}
      {!isLoading && (
        <div className="application-table-wrapper">
          <table className="application-table">
            <thead>
              {/* ... (th 목록) ... */}
            </thead>
            <tbody>
              {applications.map(app => (
                <tr key={app.uid}>
                  <td>{app.companyName}</td>
                  <td>{app.ceoName}</td>
                  <td>{app.contactName}</td>
                  <td>{app.contactPhone}</td>
                  <td>{timestampToDateString(app.createdAt)}</td>
                  <td>{app.status}</td>
                  <td>
                    {app.status === 'pending' && (
                      <button className="detail-button" onClick={() => handleViewDetails(app)}>
                        상세/처리
                      </button>
                    )}
                    {app.status !== 'pending' && (
                      <button 
                        className="detail-button" 
                        style={{ backgroundColor: '#6c757d' }} 
                        onClick={() => handleViewDetails(app)}
                      >
                        내역 보기
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {applications.length === 0 && (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center' }}>
                    {activeNewAppSubTab === 'pending' && '대기 중인 신청서가 없습니다.'}
                    {activeNewAppSubTab === 'approved' && '승인된 내역이 없습니다.'}
                    {activeNewAppSubTab === 'rejected' && '부결된 내역이 없습니다.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );

  // [⭐ 5. 수정] "정보변경 신청 관리" 탭 렌더링
  const renderInfoChangeTab = () => (
    <div className="seller-tab-content">

      {/* 6-1. 하위 탭 버튼들 (seller-sub-tabs 클래스 재사용) */}
      <div className="seller-sub-tabs">
        <button
          className={`seller-sub-tab-button ${activeInfoChangeSubTab === 'pending' ? 'active' : ''}`}
          onClick={() => setActiveInfoChangeSubTab('pending')}
        >
          신청 목록
        </button>
        <button
          className={`seller-sub-tab-button ${activeInfoChangeSubTab === 'approved' ? 'active' : ''}`}
          onClick={() => setActiveInfoChangeSubTab('approved')}
        >
          승인 내역
        </button>
        <button
          className={`seller-sub-tab-button ${activeInfoChangeSubTab === 'rejected' ? 'active' : ''}`}
          onClick={() => setActiveInfoChangeSubTab('rejected')}
        >
          부결 내역
        </button>
      </div>
      
      <h3>
        {activeInfoChangeSubTab === 'pending' && '정보변경 신청 목록'}
        {activeInfoChangeSubTab === 'approved' && '정보변경 승인 내역'}
        {activeInfoChangeSubTab === 'rejected' && '정보변경 부결 내역'}
      </h3>
      {/* ... (p 태그) ... */}

      {/* 6-3. 목록 테이블 */}
      {isLoading && <p>신청 목록을 불러오는 중입니다...</p>}
      {!isLoading && (
        <div className="application-table-wrapper">
          <table className="application-table">
            <thead>
              <tr>
                <th>상호명 (요청)</th>
                <th>신청자 (UID)</th>
                <th>요청일</th>
                <th>상태</th>
                <th>관리</th>
              </tr>
            </thead>
            <tbody>
              {changeRequests.map(req => (
                <tr key={req.uid}>
                  <td>{req.requestedInfo.companyName}</td>
                  <td>{req.userId}</td>
                  <td>{timestampToDateString(req.createdAt)}</td>
                  <td>{req.status}</td>
                  <td>
                    {req.status === 'pending' && (
                      <button className="detail-button" onClick={() => handleViewChangeDetails(req)}>
                        상세/처리
                      </button>
                    )}
                    {req.status !== 'pending' && (
                      <button 
                        className="detail-button" 
                        style={{ backgroundColor: '#6c757d' }} 
                        onClick={() => handleViewChangeDetails(req)}
                      >
                        내역 보기
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {changeRequests.length === 0 && (
                <tr>
                  <td colSpan={5} style={{ textAlign: 'center' }}>
                    {activeInfoChangeSubTab === 'pending' && '대기 중인 정보 변경 요청이 없습니다.'}
                    {activeInfoChangeSubTab === 'approved' && '승인된 내역이 없습니다.'}
                    {activeInfoChangeSubTab === 'rejected' && '부결된 내역이 없습니다.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );

  return (
    <div>
      <h2>셀러 관리</h2>
      
      {/* 1. 내부 메인 탭 (3개) */}
      <div className="seller-main-tabs">
        <button
          className={`seller-tab-button ${activeTab === 'main' ? 'active' : ''}`}
          onClick={() => setActiveTab('main')}
        >
          셀러 관리
        </button>
        <button
          className={`seller-tab-button ${activeTab === 'newApplications' ? 'active' : ''}`}
          onClick={() => setActiveTab('newApplications')}
        >
          <span>신규 셀러 신청 관리</span>
          {pendingCount > 0 && (
            <span className="new-notification">N</span>
          )}
        </button>
        <button
          className={`seller-tab-button ${activeTab === 'infoChange' ? 'active' : ''}`}
          onClick={() => setActiveTab('infoChange')}
        >
          <span>정보변경 신청 관리</span>
          {infoChangeCount > 0 && (
            <span className="new-notification">N</span>
          )}
        </button>
      </div>
      
      {/* 2. 탭 콘텐츠 렌더링 */}
      {activeTab === 'main' && renderMainTab()}
      {activeTab === 'newApplications' && renderNewApplicationsTab()}
      {activeTab === 'infoChange' && renderInfoChangeTab()}

      {/* 3. 모달 (2종류) */}
      {selectedApp && (
        <SellerApplicationDetailModal
          application={selectedApp}
          onClose={handleCloseModal}
        />
      )}
      {selectedChangeRequest && (
        <SellerInfoChangeDetailModal
          requestData={selectedChangeRequest}
          onClose={handleCloseChangeModal}
        />
      )}
    </div>
  );
};

export default SellerManagementTab;