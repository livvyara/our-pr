export interface Product {
    id: string;
    partnerUid: string;
    name: string;
    category: string; // 타일, 마루, 벽지, 조명, 욕실, 기타
    imageUrl: string;
    description: string;
    createdAt: any;
}

export interface CartItem extends Product {
    cartId: string; // 장바구니 항목 고유 ID
    addedAt: any;
}