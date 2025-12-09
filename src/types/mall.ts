export interface Supplier {
    id: string;
    name: string;      // 거래처명
    contactPerson: string; // 담당자
    phone: string;     // 연락처
    email: string;     // 이메일
    address: string;   // 주소
    memo: string;      // 메모
    createdAt: any;
}

export interface Category {
    id: string;
    name: string;
    level: 1 | 2 | 3 | 4; // 1: 대분류, 2: 소분류, 3: 소소분류, 4: 소소소분류
    parentId: string | null; // 상위 카테고리 ID
    path: string; // 전체 경로 (예: 대분류 > 소분류) - 검색용
}