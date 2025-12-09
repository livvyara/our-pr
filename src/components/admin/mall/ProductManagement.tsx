import React, { useState, useEffect } from 'react';
import { getFirestore, collection, query, orderBy, getDocs, deleteDoc, doc, where } from 'firebase/firestore';
import './MallCommon.css';

const ProductManagement: React.FC = () => {
    const db = getFirestore();
    const [products, setProducts] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    const fetchProducts = async () => {
        try {
            // 관리자가 등록한 상품만 가져오기 (registeredBy == 'admin')
            const q = query(collection(db, 'products'), where('registeredBy', '==', 'admin'), orderBy('createdAt', 'desc'));
            const snap = await getDocs(q);
            setProducts(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        } catch (e) { console.error(e); }
        finally { setLoading(false); }
    };

    useEffect(() => { fetchProducts(); }, []);

    const handleDelete = async (id: string) => {
        if(!confirm("삭제하시겠습니까?")) return;
        await deleteDoc(doc(db, 'products', id));
        fetchProducts();
    };

    return (
        <div className="mall-sub-page">
            <h3>📋 상품 목록 관리 ({products.length})</h3>
            {loading ? <p>Loading...</p> : (
                <table className="mall-table">
                    <thead>
                        <tr>
                            <th>이미지</th>
                            <th>카테고리</th>
                            <th>상품명</th>
                            <th>가격</th>
                            <th>등록일</th>
                            <th>관리</th>
                        </tr>
                    </thead>
                    <tbody>
                        {products.map(p => (
                            <tr key={p.id}>
                                <td><img src={p.imageUrl} alt="" className="table-img" /></td>
                                <td>{p.category}</td>
                                <td>{p.name}</td>
                                <td>{Number(p.price).toLocaleString()}원</td>
                                <td>{p.createdAt?.toDate().toLocaleDateString()}</td>
                                <td><button onClick={() => handleDelete(p.id)} className="btn-del">삭제</button></td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            )}
        </div>
    );
};

export default ProductManagement;