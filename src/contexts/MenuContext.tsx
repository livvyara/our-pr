// src/contexts/MenuContext.tsx
import React, { createContext, useContext, useState, useEffect } from 'react';
import { getFirestore, collection, doc, getDoc, getDocs, query, orderBy } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '../firebase-config'; // (경로가 ../firebase-config인지 확인 필요)
import { type MainMenuData, type SubMenuItemData, type SubMenuDocument } from '../types/MenuTypes';

// 1. 컨텍스트가 제공할 데이터 타입
interface MenuContextState {
  isLoading: boolean;
  mainMenus: MainMenuData[]; // (등급 필터링 완료된)
  subMenus: Map<string, SubMenuItemData[]>; // (등급 필터링 완료된)
  userRole: string; // (현재 사용자 등급)
}

// 2. 컨텍스트 생성 (기본값)
const MenuContext = createContext<MenuContextState>({
  isLoading: true,
  mainMenus: [],
  subMenus: new Map(),
  userRole: 'customer', // (비로그인/기본값)
});

// 3. 커스텀 훅 (컴포넌트에서 쉽게 사용하기 위함)
export const useMenu = () => useContext(MenuContext);

// 4. 컨텍스트 제공자 (Provider)
export const MenuProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, setState] = useState<MenuContextState>({
    isLoading: true,
    mainMenus: [],
    subMenus: new Map(),
    userRole: 'customer',
  });

  useEffect(() => {
    const db = getFirestore();
    let userRole = 'customer'; // (비로그인 시 기본값)

    // 5. 인증 상태 리스너
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setState(prevState => ({ ...prevState, isLoading: true }));

      try {
        // 5-1. 유저의 role 가져오기
        if (user) {
          const userDocRef = doc(db, "users", user.uid);
          const userDocSnap = await getDoc(userDocRef);
          // (참고) Firestore에 문서가 없거나 role이 없으면 'customer'
          userRole = userDocSnap.data()?.role || 'customer';
        } else {
          userRole = 'customer'; // 비로그인 시
        }

        // 5-2. 메인 메뉴 로드 및 role 필터링
        const mainMenusQuery = query(collection(db, 'mainMenus'), orderBy("order", "asc"));
        const mainMenusSnapshot = await getDocs(mainMenusQuery);
        const filteredMainMenus: MainMenuData[] = [];
        
        mainMenusSnapshot.forEach((doc) => {
          const menu = { id: doc.id, ...doc.data() } as MainMenuData;
          // (보안) 이 메뉴가 현재 userRole을 허용하는지 확인
          if (menu.roles && menu.roles.includes(userRole)) {
            filteredMainMenus.push(menu);
          }
        });

        // 5-3. 서브 메뉴 로드 및 role 필터링
        const subMenusMap = new Map<string, SubMenuItemData[]>();
        for (const mainMenu of filteredMainMenus) {
          const subMenuDocRef = doc(db, 'subMenus', mainMenu.key);
          const subMenuDocSnap = await getDoc(subMenuDocRef);
          
          if (subMenuDocSnap.exists()) {
            const data = subMenuDocSnap.data() as SubMenuDocument;
            const filteredSubMenus = (data.items || [])
              .filter(sub => sub.roles && sub.roles.includes(userRole)) // (보안) role 필터링
              .sort((a, b) => a.order - b.order); // (정렬)
            
            subMenusMap.set(mainMenu.key, filteredSubMenus);
          }
        }
        
        // 5-4. 최종 state 업데이트
        setState({
          isLoading: false,
          mainMenus: filteredMainMenus,
          subMenus: subMenusMap,
          userRole: userRole,
        });

      } catch (error) {
        console.error("동적 메뉴 로딩 실패:", error);
        // (Firestore 보안 규칙이 'menus'/'subMenus' 읽기를 허용하는지 확인 필요)
        setState({
          isLoading: false,
          mainMenus: [], // 에러 시 빈 메뉴
          subMenus: new Map(),
          userRole: userRole,
        });
      }
    });

    return () => unsubscribe(); // 클린업
  }, []);

  return (
    <MenuContext.Provider value={state}>
      {children}
    </MenuContext.Provider>
  );
};