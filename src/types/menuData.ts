// src/types/menuData.ts

// [1. 수정] 서브 메뉴를 위한 인터페이스 정의
export interface SubMenuData {
  title: string;
  path: string; // (예: '/partners')
}

export interface MenuData {
  key: string;
  title: string;
  // [2. 수정] string[] 대신 SubMenuData[] 사용
  subMenus: SubMenuData[];
}

export const kAppMenus: MenuData[] = [
  {
    key: 'menu1',
    title: '아워서포터',
    // [3. 수정] 객체 형태로 경로(path)를 지정
    subMenus: [
      { title: '파트너스', path: '/partners' }, // (임시 경로)
      { title: '커스토머', path: '/customer' }, // (임시 경로)
    ],
  },
  {
    key: 'menu2',
    title: '메뉴2',
    subMenus: [
      { title: '하위메뉴 2-A', path: '/menu2/a' }, // (임시 경로)
      { title: '하위메뉴 2-B', path: '/menu2/b' }, // (임시 경로)
    ],
  },
  {
    key: 'menu3',
    title: '이용안내',
    subMenus: [
      { title: '프로젝트 개요', path: '/guide/intro' },  // (임시 경로)
      { title: '파트너스 신청', path: '/guide/apply' }, // (임시 경로)
      { title: '아워서포터 PC', path: '/guide/pc' },   // (임시 경로)
      { title: '아워서포터 APP', path: '/guide/app' },  // (임시 경로)
    ],
  },
];