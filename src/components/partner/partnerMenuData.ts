export interface PartnerMenu {
  key: string;
  title: string;
  subMenus: {
    key: string;
    title: string;
    path: string; // (절대 경로)
  }[];
}

export const PARTNER_MENUS_DATA: PartnerMenu[] = [
  // [NEW] 사내공통기능 (현장관리 위에 배치)
  { 
    key: 'common', 
    title: '사내공통기능', 
    subMenus: [
      { key: 'company-notice', title: '사내 공지사항', path: '/program/company-notice' },
      { key: 'company-approval', title: '전자결재', path: '/program/company-approval' },
    ]
  },
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
      { key: 'hr-add-worker', title: '작업자 관리', path: '/program/worker-management' },
      { key: 'hr-add-log', title: '노무 등록', path: '/program/hr-labor-cost' },
    ]
  },
  { 
    key: 'accounting', 
    title: '회계관리', 
    subMenus: [
      { key: 'accounting-hometax', title: '홈택스 수집', path: '/program/accounting-hometax' },
      { key: 'accounting-banking-excel', title: '계좌/카드내역 등록', path: '/program/accounting-banking-excel' },
      { key: 'accounting-integrated', title: '세금/현금 계산서내역', path: '/program/accounting-integrated' },
      { key: 'accounting-giro-receipt', title: '지로/영수증 지출등록', path: '/program/accounting-giro-receipt' },
      { key: 'accounting-order-request', title: '현장별 발주요청', path: '/program/accounting-order-request' },
      { key: 'site-settlement', title: '현장 결산', path: '/program/site-settlement' },
      { key: 'accounting-expense-category', title: '지출품목 설정', path: '/program/accounting-expense-category' },
    ]
  },
  { 
    key: 'employees', 
    title: '직원관리', 
    subMenus: [
      { key: 'emp-integrated', title: '직원등록/목록', path: '/program/emp-integrated' },
      { key: 'org-management', title: '직급/조직관리', path: '/program/org-management' },
      { key: 'emp-management', title: '급여/상여/정보관리', path: '/program/emp-management' },
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
    key: 'activity',
    title: '활동 내역',
    subMenus: [
      { key: 'activity-log', title: '활동로그', path: '/program/activity-log' },
    ]
  }
];