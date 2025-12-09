// src/pages/program/SiteDetailPage.tsx

import React, { useState, useEffect } from 'react';
import { useParams, useLocation, useNavigate } from 'react-router-dom'; 
import { 
  getFirestore, doc, getDoc, 
  collectionGroup, query, getDocs 
} from 'firebase/firestore';
import { auth } from '../../firebase-config';
import './SiteDetailPage.css'; 

// 위젯 임포트
import SiteMemoWidget from '../../components/partner/SiteMemoWidget';
import SiteFilesWidget from '../../components/partner/SiteFilesWidget'; 
import SiteActionsWidget from '../../components/partner/SiteActionsWidget'; 
import SiteInfoWidget from '../../components/partner/SiteInfoWidget'; 

interface SiteDetailPageProps {
  partnerUid?: string | null; 
}

interface SiteData {
  siteName: string;
  address: string;
  client1Name: string;
  client1Phone: string;
  client2Name: string;
  client2Phone: string;
  budget: number;
  area: string;
  startDate: string;
  siteType: 'commercial' | 'residential';
  partnerUid: string; 
  status: string; 
  openDate?: string;
  businessType?: string;
  moveInDate?: string;
  contractSupply?: number;
  contractVat?: number;
}

const SiteDetailPage: React.FC<SiteDetailPageProps> = ({ partnerUid: propPartnerUid }) => {
  const { siteId } = useParams<{ siteId: string }>(); 
  const location = useLocation(); 
  const navigate = useNavigate(); 
  
  const [siteData, setSiteData] = useState<SiteData | null>(null);
  const [currentOwnerUid, setCurrentOwnerUid] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  
  const db = getFirestore();

  useEffect(() => {
    if (!siteId) return;

    const fetchSiteData = async () => {
      setIsLoading(true);
      try {
        let targetUid = propPartnerUid || location.state?.ownerUid;

        // [CASE 1] 주인을 알고 있는 경우
        if (targetUid) {
          const siteDocRef = doc(db, 'users', targetUid, 'sites', siteId);
          const docSnap = await getDoc(siteDocRef);

          if (docSnap.exists()) {
            setSiteData(docSnap.data() as SiteData);
            setCurrentOwnerUid(targetUid);
          } else {
            console.warn("지정된 경로에 문서 없음. 전체 검색 시도.");
            targetUid = null; 
          }
        }

        // [CASE 2] 주인을 모르거나 실패한 경우 (전체 검색 - Fallback)
        if (!targetUid) {
          const sitesQuery = query(collectionGroup(db, 'sites'));
          const querySnapshot = await getDocs(sitesQuery);
          const foundDoc = querySnapshot.docs.find(doc => doc.id === siteId);

          if (foundDoc) {
            setSiteData(foundDoc.data() as SiteData);
            if (foundDoc.ref.parent.parent) {
              setCurrentOwnerUid(foundDoc.ref.parent.parent.id);
            }
          } else {
            console.error("해당 현장 문서를 찾을 수 없습니다.");
            setSiteData(null);
          }
        }
      } catch (error) {
        console.error("현장 로딩 중 오류:", error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchSiteData();
  }, [siteId, db, propPartnerUid, location.state]);

  const handleSaveSuccess = (updatedLocalData: SiteData) => {
    setSiteData(updatedLocalData);
  };

  if (isLoading) {
    return <div className="site-detail-loading">현장 정보를 불러오는 중입니다...</div>;
  }

  if (!siteData || !currentOwnerUid) {
    return <div className="site-detail-loading">현장 정보를 찾을 수 없습니다.</div>;
  }

  return (
    <div className="site-detail-page-container">
      
      {/* 1. 헤더 영역 */}
      <div className="site-detail-header-wrapper">
        <div className="site-detail-title">
          <h2>
             <button className="site-detail-btn-back" onClick={() => navigate(-1)}>← 뒤로</button>
             {siteData.siteName}
          </h2>
          <p>현장 상세 정보를 확인하고 관리합니다.</p>
        </div>
      </div>

      {/* 2. 메인 그리드 (2x2 or 모바일 1열) */}
      <div className="site-detail-grid">
        
        {/* [1. 좌상단] 현장 정보 */}
        <div className="quadrant-box quadrant-info">
          <SiteInfoWidget 
            siteData={siteData}
            siteId={siteId!} 
            partnerUid={currentOwnerUid} 
            onSaveSuccess={handleSaveSuccess}
            widgetTitle="현장 정보"
          />
        </div>

        {/* [2. 우상단] 메모 */}
        <div className="quadrant-box quadrant-memo">
          <SiteMemoWidget 
            siteId={siteId!} 
            partnerUid={currentOwnerUid} 
            siteName={siteData.siteName} 
          />
        </div>

        {/* [3. 좌하단] 자료 등록 */}
        <div className="quadrant-box quadrant-files">
          <SiteFilesWidget 
            siteId={siteId!} 
            partnerUid={currentOwnerUid} 
            initialStatus={siteData.status} 
          />
        </div>

        {/* [4. 우하단] 기타 등록 */}
        <div className="quadrant-box quadrant-actions">
          <SiteActionsWidget 
            siteId={siteId!} 
            partnerUid={currentOwnerUid} 
            currentSiteName={siteData.siteName}
            status={siteData.status}
          />
        </div>

      </div>
    </div>
  );
};

export default SiteDetailPage;