// src/components/common/RoleHeader.tsx

import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
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
  // [⭐ 수정] admin 등급 추가
  admin: {
    text: '관리자 페이지로 이동',
    link: '/admin', // (지정된 경로)
  },
    employee: {
    text: '임직원 페이지로 이동',
    link: '/employee', // (지정된 경로)
  },
  partner: {
    text: '파트너 서포터 페이지로 이동',
    link: '/partnersupport',
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

  useEffect(() => {
    const db = getFirestore();

    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        const docRef = doc(db, "users", user.uid);
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
          const userRole = docSnap.data().role; 
          
          // [수정] admin이 맵에 추가되었으므로 자동으로 처리됨
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

  if (isLoading || !roleData) {
    return null;
  }

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