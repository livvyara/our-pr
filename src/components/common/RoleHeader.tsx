// src/components/common/RoleHeader.tsx

import React, { useState, useEffect } from 'react';
// [⭐ 1. 수정] useLocation 임포트 추가
import { Link, useLocation } from 'react-router-dom';
import { K_BRAND_COLOR } from '../../constants';
import './RoleHeader.css';

// Firebase 모듈
import { auth } from '../../firebase-config';
import { getFirestore, doc, getDoc } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';

// ----------------------------------------------------
// (헬퍼 타입) 역할에 따른 데이터 정의
// ----------------------------------------------------
interface RoleData {
  text: string;
  link: string;
}

const ROLE_MAP: Record<string, RoleData> = {
  admin: {
    text: '관리자 페이지로 이동',
    link: '/admin', 
  },
    employee: {
    text: '임직원 페이지로 이동',
    link: '/employee', 
  },
  partner: {
    text: '파트너 서포터 페이지로 이동',
    link: '/program',
  },
    sub_partner: {
    text: '파트너 서포터 페이지로 이동',
    link: '/program',
  },
  seller: {
    text: '셀러 서포터 페이지로 이동',
    link: '/sellersupport',
  },
  contract: {
    text: '협력사 서포터 페이지로 이동',
    link: '/contractsupport',
  },
};
// ----------------------------------------------------


const RoleHeader: React.FC = () => {
  const [roleData, setRoleData] = useState<RoleData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  
  // [⭐ 2. 추가] useLocation 훅 실행
  const location = useLocation();

  useEffect(() => {
    const db = getFirestore();

    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        const docRef = doc(db, "users", user.uid);
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
          const userRole = docSnap.data().role; 
          setRoleData(ROLE_MAP[userRole] || null);
        } else {
          setRoleData(null);
        }
      } else {
        setRoleData(null);
      }
      setIsLoading(false);
    });

    return () => unsubscribe();
  }, []);

  // [⭐ 3. 수정] 로딩/데이터 없음 조건
  if (isLoading || !roleData) {
    return null;
  }
  
  // [⭐ 4. 추가] 파트너가 /program 경로에 있을 때 숨기는 조건
  // (roleData.link가 '/program'인 경우는 'partner' 역할임)
  if (roleData.link === '/program' && location.pathname.startsWith('/program')) {
    return null;
  }

  // (모든 조건을 통과한 경우에만 헤더 렌더링)
  return (
    <div 
      className="role-header-bar" 
      style={{ backgroundColor: K_BRAND_COLOR }}
    >
      <Link to={roleData.link} className="role-header-link">
        {roleData.text}
      </Link>
    </div>
  );
};

export default RoleHeader;