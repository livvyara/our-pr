import React, { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '../../firebase-config';

interface Props {
    children: React.ReactNode;
}

const ProtectedRoute: React.FC<Props> = ({ children }) => {
    const [user, setUser] = useState<any>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
            setUser(currentUser);
            setLoading(false);
        });
        return () => unsubscribe();
    }, []);

    if (loading) return <div>Loading...</div>;

    // 로그인이 안 되어 있으면 로그인 페이지로 강제 이동
    if (!user) {
        alert("로그인이 필요한 서비스입니다.");
        return <Navigate to="/login" replace />;
    }

    // 로그인이 되어 있으면 원래 가려던 페이지(장바구니 등)를 보여줌
    return <>{children}</>;
};

export default ProtectedRoute;