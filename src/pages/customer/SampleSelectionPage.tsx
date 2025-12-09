import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
    getFirestore, collection, query, where, getDocs, addDoc, serverTimestamp, orderBy 
} from 'firebase/firestore';
import { auth } from '../../firebase-config';
import './SampleSelectionPage.css';

// 타입 정의
interface Category {
    id: string;
    name: string;
    level: number;
}

interface Product {
    id: string;
    name: string;
    price: number;
    categoryPath: string; // 전체 경로 (문자열)
    categoryIds: { l1: string; l2: string; l3: string; l4: string }; // ID 맵
    imageUrl: string;
    description: string;
    registeredBy: string;
}

const SampleSelectionPage: React.FC = () => {
    const db = getFirestore();
    const navigate = useNavigate();
    
    // 데이터 상태
    const [categories, setCategories] = useState<Category[]>([]);
    const [products, setProducts] = useState<Product[]>([]);
    const [filteredProducts, setFilteredProducts] = useState<Product[]>([]);
    
    // 필터 상태
    const [selectedCatId, setSelectedCatId] = useState<string>('all');
    const [searchTerm, setSearchTerm] = useState('');
    const [loading, setLoading] = useState(true);

    // 1. 초기 데이터 로드 (카테고리 + 상품)
    useEffect(() => {
        const loadData = async () => {
            try {
                // (1) 대분류(Level 1) 카테고리만 가져오기 (탭 메뉴용)
                const catQ = query(
                    collection(db, 'categories'), 
                    where('level', '==', 1),
                    orderBy('name', 'asc')
                );
                const catSnap = await getDocs(catQ);
                const catList = catSnap.docs.map(d => ({ id: d.id, ...d.data() } as Category));
                setCategories(catList);

                // (2) 관리자가 등록한 상품 가져오기
                const prodQ = query(
                    collection(db, 'products'),
                    where('registeredBy', '==', 'admin'), // 관리자 상품만
                    where('isPublic', '==', true) // 공개된 상품만
                );
                const prodSnap = await getDocs(prodQ);
                const prodList = prodSnap.docs.map(d => ({ id: d.id, ...d.data() } as Product));
                
                // 최신순 정렬 (Client side sort if needed, or composite index)
                prodList.sort((a, b) => (b.id > a.id ? 1 : -1)); 
                
                setProducts(prodList);
                setFilteredProducts(prodList);

            } catch (e) {
                console.error("데이터 로딩 실패:", e);
            } finally {
                setLoading(false);
            }
        };
        loadData();
    }, []);

    // 2. 필터링 로직 (카테고리 선택 or 검색어 입력 시)
    useEffect(() => {
        let result = products;

        // 카테고리 필터 (L1 ID로 매칭)
        if (selectedCatId !== 'all') {
            result = result.filter(p => p.categoryIds?.l1 === selectedCatId);
        }

        // 검색어 필터
        if (searchTerm) {
            result = result.filter(p => 
                p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                p.categoryPath.includes(searchTerm)
            );
        }

        setFilteredProducts(result);
    }, [selectedCatId, searchTerm, products]);

    // 3. 장바구니 담기 핸들러
    const handleAddToCart = async (product: Product, type: 'normal' | 'sample') => {
        const user = auth.currentUser;
        if (!user) return alert("로그인이 필요한 서비스입니다.");

        const targetName = type === 'normal' ? '장바구니(구매)' : '샘플바구니';
        if (!confirm(`'${product.name}'을(를) [${targetName}]에 담으시겠습니까?`)) return;

        try {
            await addDoc(collection(db, 'users', user.uid, 'cart'), {
                productId: product.id,
                name: product.name,
                category: product.categoryPath, // 전체 경로 저장
                price: product.price || 0,
                imageUrl: product.imageUrl,
                description: product.description,
                
                // [중요] 상태 구분 (일반 vs 샘플)
                status: type, 
                
                addedAt: serverTimestamp()
            });

            if(confirm(`[${targetName}]에 담았습니다.\n장바구니 페이지로 이동하시겠습니까?`)) {
                navigate('/customer/cart');
            }
        } catch (e) {
            console.error(e);
            alert("담기 실패. 다시 시도해주세요.");
        }
    };

    return (
        <div className="ss-page">
            <div className="ss-header-area">
                <div className="ss-titles">
                    <h2>자재 / 샘플 라운지</h2>
                    <p>엄선된 자재를 직접 확인하고 선택하세요.</p>
                </div>
                <div className="ss-actions">
                    <div className="ss-search-box">
                        <input 
                            type="text" 
                            placeholder="자재명 검색..." 
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                        <button>🔍</button>
                    </div>
                    <button className="btn-go-cart" onClick={() => navigate('/customer/cart')}>
                        🛒 장바구니
                    </button>
                </div>
            </div>

            {/* 카테고리 탭 (관리자 설정 연동) */}
            <div className="ss-category-tabs">
                <button 
                    className={`ss-tab ${selectedCatId === 'all' ? 'active' : ''}`}
                    onClick={() => setSelectedCatId('all')}
                >
                    전체보기
                </button>
                {categories.map(cat => (
                    <button 
                        key={cat.id} 
                        className={`ss-tab ${selectedCatId === cat.id ? 'active' : ''}`}
                        onClick={() => setSelectedCatId(cat.id)}
                    >
                        {cat.name}
                    </button>
                ))}
            </div>

            {/* 상품 리스트 */}
            {loading ? (
                <div className="ss-loading">상품 정보를 불러오는 중입니다...</div>
            ) : (
                <div className="ss-product-grid">
                    {filteredProducts.length === 0 ? (
                        <div className="ss-empty-state">
                            <p>등록된 상품이 없거나 검색 결과가 없습니다.</p>
                        </div>
                    ) : (
                        filteredProducts.map(prod => (
                            <div key={prod.id} className="ss-product-card">
                                <div className="ss-card-img">
                                    <img src={prod.imageUrl} alt={prod.name} />
                                    {/* 카테고리 경로 배지 (ex: 타일 > 포세린) */}
                                    <span className="ss-cat-badge">
                                        {prod.categoryPath?.split('>').pop()?.trim() || '기타'}
                                    </span>
                                </div>
                                <div className="ss-card-body">
                                    <h4 title={prod.name}>{prod.name}</h4>
                                    <p className="ss-desc">{prod.description}</p>
                                    <div className="ss-price">
                                        {prod.price ? `${prod.price.toLocaleString()} 원` : '가격문의'}
                                    </div>
                                    
                                    <div className="ss-card-buttons">
                                        <button 
                                            className="btn-add-sample" 
                                            onClick={() => handleAddToCart(prod, 'sample')}
                                        >
                                            🎨 샘플담기
                                        </button>
                                        <button 
                                            className="btn-add-buy" 
                                            onClick={() => handleAddToCart(prod, 'normal')}
                                        >
                                            🛒 구매담기
                                        </button>
                                    </div>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            )}
        </div>
    );
};

export default SampleSelectionPage;