import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
    getFirestore, collection, query, orderBy, getDocs, deleteDoc, doc, updateDoc, addDoc, serverTimestamp, setDoc 
} from 'firebase/firestore';
import { auth } from '../../firebase-config';
import './CartPage.css';

// --- 타입 정의 ---
export interface CartItem {
    cartId: string;
    id: string; // 상품 원본 ID
    name: string;
    category: string;
    imageUrl: string;
    price: number;
    description: string;
    // [핵심] 현재 상태: 'normal'(일반장바구니) | 'sample'(샘플바구니) | 'deleted'(삭제됨)
    status: 'normal' | 'sample' | 'deleted'; 
    addedAt: any;
}

export interface Address {
    id: string;
    name: string; // 배송지명 (예: 우리집)
    recipient: string; // 수령인
    phone: string;
    address: string;
    detailAddress: string;
    isDefault: boolean;
}

const CartPage: React.FC = () => {
    const db = getFirestore();
    const navigate = useNavigate();
    
    // --- 상태 관리 ---
    const [activeTab, setActiveTab] = useState<'normal' | 'sample' | 'deleted'>('normal');
    const [cartItems, setCartItems] = useState<CartItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedItems, setSelectedItems] = useState<string[]>([]); // 선택된 cartId 목록

    // 주소 관련 상태
    const [addresses, setAddresses] = useState<Address[]>([]);
    const [selectedAddressId, setSelectedAddressId] = useState<string>('');
    const [isAddressModalOpen, setIsAddressModalOpen] = useState(false);
    
    // 주소 입력 폼
    const [addrForm, setAddrForm] = useState({
        name: '', recipient: '', phone: '', address: '', detailAddress: ''
    });

    const currentUser = auth.currentUser;

    // --- 데이터 불러오기 ---
    useEffect(() => {
        const fetchData = async () => {
            if (!currentUser) return;
            setLoading(true);
            try {
                // 1. 장바구니 아이템 불러오기
                const cartQ = query(
                    collection(db, 'users', currentUser.uid, 'cart'),
                    orderBy('addedAt', 'desc')
                );
                const cartSnap = await getDocs(cartQ);
                const items = cartSnap.docs.map(d => ({ cartId: d.id, ...d.data() } as CartItem));
                
                // 데이터가 없는 경우를 대비해 status가 없는 구형 데이터는 'normal'로 간주
                const correctedItems = items.map(item => ({
                    ...item,
                    status: item.status || 'normal'
                }));
                
                setCartItems(correctedItems);

                // 2. 주소 목록 불러오기
                const addrQ = query(collection(db, 'users', currentUser.uid, 'addresses'));
                const addrSnap = await getDocs(addrQ);
                const addrList = addrSnap.docs.map(d => ({ id: d.id, ...d.data() } as Address));
                setAddresses(addrList);
                
                // 기본 배송지 선택
                const defaultAddr = addrList.find(a => a.isDefault);
                if (defaultAddr) setSelectedAddressId(defaultAddr.id);
                else if (addrList.length > 0) setSelectedAddressId(addrList[0].id);

            } catch (e) {
                console.error("데이터 로딩 실패:", e);
            } finally {
                setLoading(false);
            }
        };

        if (currentUser) {
            fetchData();
        } else {
            // 로그인 안되어있으면 로그인 페이지로
            // navigate('/login'); // 필요시 주석 해제
            setLoading(false);
        }
    }, [currentUser, db]);

    // --- 필터링된 아이템 목록 ---
    const filteredItems = cartItems.filter(item => item.status === activeTab);

    // --- 핸들러: 아이템 상태 변경 (이동, 삭제, 복구) ---
    const updateItemStatus = async (cartId: string, newStatus: 'normal' | 'sample' | 'deleted') => {
        if (!currentUser) return;
        try {
            await updateDoc(doc(db, 'users', currentUser.uid, 'cart', cartId), { status: newStatus });
            setCartItems(prev => prev.map(item => item.cartId === cartId ? { ...item, status: newStatus } : item));
            // 선택 목록에서 제거
            setSelectedItems(prev => prev.filter(id => id !== cartId));
        } catch (e) { console.error(e); alert("상태 변경 실패"); }
    };

    // --- 핸들러: 영구 삭제 ---
    const hardDelete = async (cartId: string) => {
        if (!confirm("영구 삭제하시겠습니까? 복구할 수 없습니다.")) return;
        if (!currentUser) return;
        try {
            await deleteDoc(doc(db, 'users', currentUser.uid, 'cart', cartId));
            setCartItems(prev => prev.filter(item => item.cartId !== cartId));
            setSelectedItems(prev => prev.filter(id => id !== cartId));
        } catch (e) { console.error(e); }
    };

    // --- 핸들러: 일괄 처리 ---
    const handleBulkAction = async (action: 'move_sample' | 'move_normal' | 'delete' | 'restore' | 'hard_delete') => {
        if (selectedItems.length === 0) return alert("선택된 상품이 없습니다.");
        
        const confirmMsg = action === 'hard_delete' ? "선택한 상품을 영구 삭제하시겠습니까?" : "선택한 상품을 이동/처리 하시겠습니까?";
        if (!confirm(confirmMsg)) return;

        for (const id of selectedItems) {
            if (action === 'move_sample') await updateItemStatus(id, 'sample');
            else if (action === 'move_normal') await updateItemStatus(id, 'normal');
            else if (action === 'delete') await updateItemStatus(id, 'deleted');
            else if (action === 'restore') await updateItemStatus(id, 'normal');
            else if (action === 'hard_delete') {
                if (!currentUser) return;
                await deleteDoc(doc(db, 'users', currentUser.uid, 'cart', id));
                setCartItems(prev => prev.filter(item => item.cartId !== id));
            }
        }
        setSelectedItems([]);
    };

    // --- 핸들러: 주소 추가 ---
    const handleAddAddress = async () => {
        if (!currentUser) return;
        if (addresses.length >= 5) return alert("주소는 최대 5개까지만 등록 가능합니다.");
        if (!addrForm.name || !addrForm.address || !addrForm.recipient || !addrForm.phone) return alert("필수 정보를 입력해주세요.");

        try {
            const newAddr = {
                ...addrForm,
                isDefault: addresses.length === 0 // 첫 주소면 기본 배송지
            };
            const res = await addDoc(collection(db, 'users', currentUser.uid, 'addresses'), newAddr);
            
            const addedAddress = { id: res.id, ...newAddr };
            setAddresses(prev => [...prev, addedAddress]);
            if (addresses.length === 0) setSelectedAddressId(res.id); // 자동 선택

            setIsAddressModalOpen(false);
            setAddrForm({ name: '', recipient: '', phone: '', address: '', detailAddress: '' }); // 초기화
        } catch (e) { console.error(e); alert("주소 저장 실패"); }
    };

    // --- 렌더링 헬퍼 ---
    const toggleSelect = (id: string) => {
        setSelectedItems(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
    };

    const toggleSelectAll = () => {
        if (selectedItems.length === filteredItems.length) setSelectedItems([]);
        else setSelectedItems(filteredItems.map(i => i.cartId));
    };

    // 총 금액 계산 (일반 장바구니용)
    const totalPrice = filteredItems.reduce((sum, item) => sum + (Number(item.price) || 0), 0);

    return (
        <div className="cart-page-container">
            <div className="cart-header-area">
                <button onClick={() => navigate(-1)} className="btn-back">← 뒤로</button>
                <h2>장바구니 / 샘플 관리</h2>
            </div>

            {/* 1. 탭 메뉴 */}
            <div className="cart-tabs">
                <button 
                    className={`cart-tab ${activeTab === 'normal' ? 'active' : ''}`} 
                    onClick={() => { setActiveTab('normal'); setSelectedItems([]); }}
                >
                    🛒 일반 장바구니
                </button>
                <button 
                    className={`cart-tab ${activeTab === 'sample' ? 'active' : ''}`} 
                    onClick={() => { setActiveTab('sample'); setSelectedItems([]); }}
                >
                    🎨 샘플 바구니
                </button>
                <button 
                    className={`cart-tab ${activeTab === 'deleted' ? 'active' : ''}`} 
                    onClick={() => { setActiveTab('deleted'); setSelectedItems([]); }}
                >
                    🗑️ 삭제 내역
                </button>
            </div>

            <div className="cart-body">
                {/* 2. 주소 관리 영역 (일반 장바구니 탭에서만 표시) */}
                {activeTab === 'normal' && (
                    <div className="address-section">
                        <div className="section-title">
                            <h3>📍 배송지 정보</h3>
                            <button 
                                className="btn-add-addr" 
                                onClick={() => {
                                    if (addresses.length >= 5) alert("최대 5개까지만 등록 가능합니다.");
                                    else setIsAddressModalOpen(true);
                                }}
                            >
                                + 배송지 추가 ({addresses.length}/5)
                            </button>
                        </div>
                        
                        {addresses.length === 0 ? (
                            <div className="addr-empty">등록된 배송지가 없습니다. 추가해주세요.</div>
                        ) : (
                            <div className="addr-list">
                                {addresses.map(addr => (
                                    <label key={addr.id} className={`addr-card ${selectedAddressId === addr.id ? 'selected' : ''}`}>
                                        <input 
                                            type="radio" 
                                            name="address" 
                                            checked={selectedAddressId === addr.id} 
                                            onChange={() => setSelectedAddressId(addr.id)} 
                                        />
                                        <div className="addr-info">
                                            <strong>{addr.name}</strong> ({addr.recipient})
                                            <p>{addr.address} {addr.detailAddress}</p>
                                            <span className="addr-phone">{addr.phone}</span>
                                        </div>
                                    </label>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {/* 3. 상품 목록 영역 */}
                <div className="items-section">
                    <div className="items-header">
                        <div className="check-all">
                            <input 
                                type="checkbox" 
                                checked={filteredItems.length > 0 && selectedItems.length === filteredItems.length}
                                onChange={toggleSelectAll}
                                disabled={filteredItems.length === 0}
                            />
                            <span>전체 선택 ({filteredItems.length})</span>
                        </div>
                        
                        <div className="bulk-actions">
                            {activeTab === 'normal' && (
                                <button onClick={() => handleBulkAction('move_sample')}>🎨 샘플로 이동</button>
                            )}
                            {activeTab === 'sample' && (
                                <button onClick={() => handleBulkAction('move_normal')}>🛒 장바구니로 이동</button>
                            )}
                            {activeTab !== 'deleted' && (
                                <button onClick={() => handleBulkAction('delete')} className="btn-del">삭제</button>
                            )}
                            {activeTab === 'deleted' && (
                                <>
                                    <button onClick={() => handleBulkAction('restore')}>♻️ 복구</button>
                                    <button onClick={() => handleBulkAction('hard_delete')} className="btn-del">🔥 영구 삭제</button>
                                </>
                            )}
                        </div>
                    </div>

                    {loading ? <div className="loading-box">로딩 중...</div> : (
                        <div className="items-list">
                            {filteredItems.length === 0 ? (
                                <div className="items-empty">상품이 없습니다.</div>
                            ) : (
                                filteredItems.map(item => (
                                    <div key={item.cartId} className="cart-item-row">
                                        <div className="item-chk">
                                            <input 
                                                type="checkbox" 
                                                checked={selectedItems.includes(item.cartId)}
                                                onChange={() => toggleSelect(item.cartId)}
                                            />
                                        </div>
                                        <div className="item-img">
                                            <img src={item.imageUrl} alt={item.name} />
                                        </div>
                                        <div className="item-info">
                                            <span className="item-cat">{item.category}</span>
                                            <h4>{item.name}</h4>
                                            <p>{item.description}</p>
                                            {activeTab !== 'deleted' && (
                                                <div className="item-price">{item.price ? item.price.toLocaleString() + '원' : '가격문의'}</div>
                                            )}
                                        </div>
                                        <div className="item-actions">
                                            {activeTab === 'normal' && (
                                                <button onClick={() => updateItemStatus(item.cartId, 'sample')}>샘플로 이동</button>
                                            )}
                                            {activeTab === 'sample' && (
                                                <button onClick={() => updateItemStatus(item.cartId, 'normal')}>장바구니로 이동</button>
                                            )}
                                            {activeTab !== 'deleted' ? (
                                                <button onClick={() => updateItemStatus(item.cartId, 'deleted')} className="btn-sm-del">삭제</button>
                                            ) : (
                                                <>
                                                    <button onClick={() => updateItemStatus(item.cartId, 'normal')}>복구</button>
                                                    <button onClick={() => hardDelete(item.cartId)} className="btn-sm-del">영구삭제</button>
                                                </>
                                            )}
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    )}
                </div>
            </div>

            {/* 4. 하단 결제/요청 바 */}
            {activeTab !== 'deleted' && filteredItems.length > 0 && (
                <div className="cart-bottom-bar">
                    <div className="total-info">
                        총 <strong>{filteredItems.length}</strong>개 품목
                        {activeTab === 'normal' && (
                            <span className="total-price">
                                합계: <em>{totalPrice.toLocaleString()}</em> 원
                            </span>
                        )}
                    </div>
                    <div className="bottom-btns">
                        {activeTab === 'normal' ? (
                            <button className="btn-action-primary" onClick={() => alert("결제 기능은 추후 구현됩니다.")}>
                                결제하기
                            </button>
                        ) : (
                            <button className="btn-action-primary" onClick={() => alert("파트너에게 샘플 정보가 전달되었습니다. (추후 구현)")}>
                                샘플 정보 전달
                            </button>
                        )}
                    </div>
                </div>
            )}

            {/* 주소 추가 모달 */}
            {isAddressModalOpen && (
                <div className="addr-modal-overlay">
                    <div className="addr-modal">
                        <h3>배송지 추가</h3>
                        <div className="addr-form">
                            <input placeholder="배송지명 (예: 우리집)" value={addrForm.name} onChange={e => setAddrForm({...addrForm, name: e.target.value})} />
                            <input placeholder="수령인" value={addrForm.recipient} onChange={e => setAddrForm({...addrForm, recipient: e.target.value})} />
                            <input placeholder="연락처" value={addrForm.phone} onChange={e => setAddrForm({...addrForm, phone: e.target.value})} />
                            <input placeholder="주소" value={addrForm.address} onChange={e => setAddrForm({...addrForm, address: e.target.value})} />
                            <input placeholder="상세주소" value={addrForm.detailAddress} onChange={e => setAddrForm({...addrForm, detailAddress: e.target.value})} />
                        </div>
                        <div className="addr-modal-actions">
                            <button onClick={() => setIsAddressModalOpen(false)} className="btn-cancel">취소</button>
                            <button onClick={handleAddAddress} className="btn-save">저장</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default CartPage;