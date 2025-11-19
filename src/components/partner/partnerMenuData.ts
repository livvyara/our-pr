// src/components/partner/partnerMenuData.ts

export interface PartnerMenu {
  key: string;
  title: string;
  subMenus: {
    key: string;
    title: string;
    path: string; // (절대 경로)
  }[];
}

/**
 * 파트너 프로그램에서 사용될 모든 메뉴의 "원본" 목록입니다.
 * (권한관리 탭과 사이드바가 이 데이터를 공유합니다.)
 */
export const PARTNER_MENUS_DATA: PartnerMenu[] = [
  { 
    key: 'sites', 
    title: '현장관리', 
    subMenus: [
      { key: 'site-add', title: '현장 추가', path: '/program/site-add' },
      { key: 'site-delete', title: '현장 삭제', path: '/program/site-delete' },
      { key: 'site-list', title: '현장 목록', path: '/program/site-list' },
      { key: 'site-log', title: '작업 일지', path: '/program/site-log' },
      { key: 'site-schedule', title: '공사 일정', path: '/program/site-schedule' },
    ]
  },
  { 
    key: 'hr', 
    title: '노무관리', 
    subMenus: [
      { key: 'hr-add-worker', title: '작업자 등록', path: '/program/hr-add-worker' },
      { key: 'hr-add-log', title: '노무 등록', path: '/program/hr-add-log' },
      { key: 'hr-export-excel', title: '엑셀다운로드(신고용)', path: '/program/hr-export-excel' },
    ]
  },
  { 
    key: 'accounting', 
    title: '회계관리', 
    subMenus: [
      { key: 'accounting-sales', title: '매출자료 등록(제공예정)', path: '/program/accounting-sales' },
      { key: 'accounting-purchase', title: '매입자료 등록(제공예정)', path: '/program/accounting-purchase' },
    ]
  },
  { 
    key: 'employees', 
    title: '직원관리', 
    subMenus: [
      { key: 'emp-add', title: '직원 등록', path: '/program/emp-add' },
      { key: 'emp-list', title: '직원 목록', path: '/program/emp-list' },
      // [⭐ 추가] 권한관리 탭 (partner 역할만 보게 됨)
      { key: 'emp-permission', title: '권한관리', path: '/program/emp-permission' },
    ]
  },
  { 
    key: 'profile', 
    title: '프로필관리', 
    subMenus: [
      { key: 'profile-edit', title: '정보수정(마이페이지)', path: '/mypage' }
    ]
  },
  { 
    key: 'portfolio', 
    title: '포트폴리오 관리', 
    subMenus: [
      { key: 'portfolio-add', title: '포트폴리오 등록', path: '/program/portfolio-add' },
      { key: 'portfolio-list', title: '포트폴리오 목록', path: '/program/portfolio-list' },
    ]
  },
{
    key: 'activity', // (대메뉴 키)
    title: '활동 내역', // (대메뉴 제목)
    subMenus: [
      { key: 'activity-log', title: '활동로그', path: '/program/activity-log' },
    ]
  }
];

