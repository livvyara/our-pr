import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  getFirestore, collection, query, where, orderBy, getDocs, Timestamp, doc, getDoc, updateDoc, increment 
} from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '../../firebase-config';
import './CommunityBoardPage.css';

// 레이아웃 컴포넌트
import Header from '../../components/common/Header';
import Footer from '../../components/common/Footer';
import RoleHeader from '../../components/common/RoleHeader';
import MobileMenu from '../../components/common/MobileMenu';
import SubNav from '../../components/common/SubNav';

// 모달 컴포넌트
import BoardWriteModal from '../../components/common/BoardWriteModal';       
import BoardDetailModal from '../../components/common/BoardDetailModal';     
import SuggestionWriteModal from '../../components/common/SuggestionWriteModal'; 
import SuggestionDetailModal from '../../components/common/SuggestionDetailModal'; 

export interface CommunityPost {
  id: string;
  title: string;
  content: string;
  category?: string; 
  authorName: string;
  createdAt: Timestamp;
  authorUid?: string;
  authorRole?: string;
  status?: 'pending' | 'completed';
  commentCount?: number;
  viewCount: number;
  hasAdditionalQuestion?: boolean; 
}

type AdminFilterType = 'all' | 'pending' | 'additional' | 'completed';

interface CommunityBoardPageProps {
  category: 'notice' | 'update' | 'suggestion' | 'inquiry';
}

const CommunityBoardPage: React.FC<CommunityBoardPageProps> = ({ category }) => {
  const db = getFirestore();
  const navigate = useNavigate();

  // --- 상태 관리 ---
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [selectedMenuKey, setSelectedMenuKey] = useState<string>('');

  const [posts, setPosts] = useState<CommunityPost[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [isAdmin, setIsAdmin] = useState(false);

  const [adminFilter, setAdminFilter] = useState<AdminFilterType>('all');

  const [isWriteModalOpen, setIsWriteModalOpen] = useState(false);
  const [selectedPost, setSelectedPost] = useState<CommunityPost | null>(null);

  // 스크롤 애니메이션 Refs
  const observerRef = useRef<IntersectionObserver | null>(null);

  // 1. 반응형 및 애니메이션 핸들러
  useEffect(() => {
    const handleResize = () => {
      const mobile = window.innerWidth < 768;
      setIsMobile(mobile);
      if (!mobile) setIsMobileMenuOpen(false);
    };
    window.addEventListener('resize', handleResize);

    // Animation Observer
    observerRef.current = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('active');
        }
      });
    }, { threshold: 0.1 });

    return () => {
      window.removeEventListener('resize', handleResize);
      observerRef.current?.disconnect();
    };
  }, []);

  // 데이터 로딩 후 애니메이션 트리거
  useEffect(() => {
    if (!isLoading && posts.length > 0) {
      setTimeout(() => {
        const fadeElems = document.querySelectorAll('.cb-fade-up');
        fadeElems.forEach((el) => observerRef.current?.observe(el));
      }, 100);
    }
  }, [isLoading, posts]);

  // 2. 인증 및 권한 체크
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        setCurrentUser(user);
        const userDoc = await getDoc(doc(db, 'users', user.uid));
        if (userDoc.exists()) {
          const role = userDoc.data().role;
          setIsAdmin(role === 'admin' || role === 'subadmin');
        }
      } else {
        setCurrentUser(null);
        setIsAdmin(false);
      }
    });
    return () => unsubscribe();
  }, [db]);

  // 3. 게시글 데이터 불러오기
  const fetchPosts = async () => {
    setIsLoading(true); 
    setPosts([]); 

    try {
      let q;
      if (category === 'suggestion' || category === 'inquiry') {
        const colName = category === 'suggestion' ? 'suggestionPosts' : 'inquiryPosts';
        const collectionRef = collection(db, colName);
        q = query(collectionRef, orderBy('createdAt', 'desc'));
      } else {
        q = query(
          collection(db, 'adminPosts'), 
          where('category', '==', category), 
          orderBy('createdAt', 'desc')
        );
      }
      
      const snapshot = await getDocs(q);
      let list = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as CommunityPost));
      
      if (category === 'notice' || category === 'update') {
        list = list.filter(post => 
             post.authorRole === 'admin' || post.authorRole === 'subadmin' || !post.authorRole
        );
      }

      setPosts(list);
    } catch (error) {
      console.error("게시글 로딩 실패:", error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchPosts();
    setAdminFilter('all'); 
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category, currentUser, isAdmin]);


  // --- 헬퍼 함수들 ---
  const formatDate = (ts: Timestamp) => ts.toDate().toISOString().split('T')[0];

  const isNewPost = (createdAt: Timestamp) => {
      const now = new Date();
      const postDate = createdAt.toDate();
      const diffTime = Math.abs(now.getTime() - postDate.getTime());
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); 
      return diffDays <= 7;
  };

  const handlePostClick = async (post: CommunityPost) => {
    if (!currentUser) {
      if(category !== 'notice' && category !== 'update') {
         alert("로그인이 필요한 서비스입니다.");
         return;
      }
    }

    if (category === 'suggestion') {
        if (!isAdmin && post.authorUid !== currentUser?.uid) {
            alert("비공개 글입니다. 작성자와 관리자만 확인할 수 있습니다.");
            return;
        }
    }
    
    setSelectedPost(post);

    let collectionName = 'adminPosts';
    if (category === 'suggestion') collectionName = 'suggestionPosts';
    if (category === 'inquiry') collectionName = 'inquiryPosts';

    const postRef = doc(db, collectionName, post.id);
    try {
        await updateDoc(postRef, { viewCount: increment(1) });
        post.viewCount = (post.viewCount || 0) + 1;
    } catch (e) { console.error(e); }
  };

  const getHeaderInfo = () => {
    switch (category) {
      case 'notice': return { title: '공지사항', subtitle: 'Notice', desc: '아워프로젝트의 주요 소식과 안내사항입니다.' };
      case 'update': return { title: '업데이트', subtitle: 'Updates', desc: '새로운 기능과 변경 사항을 확인하세요.' };
      case 'suggestion': return { title: '기능 제안', subtitle: 'Suggestion', desc: '더 나은 서비스를 위한 소중한 의견을 기다립니다.' };
      case 'inquiry': return { title: '이용 문의', subtitle: 'Q&A', desc: '궁금한 점이나 불편한 점을 자유롭게 문의해주세요.' };
      default: return { title: '게시판', subtitle: 'Board', desc: '' };
    }
  };
  const headerInfo = getHeaderInfo();
  
  const canWrite = (category === 'suggestion' || category === 'inquiry') ? !!currentUser : isAdmin;
  const isPrivateBoard = category === 'suggestion' || category === 'inquiry';

  const handleCloseWrite = (refresh: boolean) => { setIsWriteModalOpen(false); if (refresh) fetchPosts(); };
  const handleCloseDetail = (refresh?: boolean) => { setSelectedPost(null); if (refresh) fetchPosts(); };
  const handleMenuSelect = (key: string) => { setSelectedMenuKey(key); };

  const filteredPosts = posts.filter(post => {
    if (!isAdmin || category !== 'inquiry') return true; 
    if (adminFilter === 'all') return true;
    if (adminFilter === 'pending') return post.status !== 'completed'; 
    if (adminFilter === 'completed') return post.status === 'completed' && !post.hasAdditionalQuestion; 
    if (adminFilter === 'additional') return post.hasAdditionalQuestion; 
    return true;
  });

  return (
    <div className="cb-page-container"> 
      {!isMobile && <RoleHeader />}
      <Header onMenuSelected={handleMenuSelect} isMobile={isMobile} onHamburgerPressed={() => setIsMobileMenuOpen(true)} />
      {!isMobile && selectedMenuKey && <SubNav selectedMenuKey={selectedMenuKey} />}

      <div className="cb-main-wrapper">
        <div className="cb-container">
          
          {/* Header Section (Modern Tech Style) */}
          <div className="cb-header-section cb-fade-up">
            <h1 className="cb-title">{headerInfo.title}</h1>
            <div className="cb-divider-long"></div>
            <p className="cb-desc">{headerInfo.desc}</p>
          </div>

          {/* Admin Filter */}
          {isAdmin && category === 'inquiry' && (
            <div className="cb-filter-bar cb-fade-up">
              <button className={adminFilter === 'all' ? 'active' : ''} onClick={() => setAdminFilter('all')}>전체</button>
              <button className={adminFilter === 'pending' ? 'active' : ''} onClick={() => setAdminFilter('pending')}>답변대기</button>
              <button className={adminFilter === 'additional' ? 'active' : ''} onClick={() => setAdminFilter('additional')}>추가문의</button>
              <button className={adminFilter === 'completed' ? 'active' : ''} onClick={() => setAdminFilter('completed')}>답변완료</button>
            </div>
          )}

          {/* List Wrapper */}
          <div className="cb-list-wrapper cb-fade-up">
            
            {/* Top Bar (Total & Write) */}
            <div className="cb-top-bar">
                <span className="cb-total-count">총 <strong>{filteredPosts.length}</strong>개의 게시글</span>
                {canWrite && (
                    <button className="cb-btn-write" onClick={() => setIsWriteModalOpen(true)}>
                        <span className="icon">+</span>
                        {category === 'inquiry' ? '문의하기' : category === 'suggestion' ? '제안하기' : '글쓰기'}
                    </button>
                )}
            </div>

            {isLoading ? (
              <div className="cb-loading">데이터를 불러오는 중입니다...</div>
            ) : (
              <table className="cb-table">
                <colgroup>
                  <col style={{width: '60px'}} /> 
                  {isPrivateBoard && <col style={{width: '90px'}} />} 
                  <col /> 
                  <col style={{width: '120px'}} /> 
                  <col style={{width: '140px'}} />
                  <col style={{width: '80px'}} />
                </colgroup>
                <thead>
                  <tr>
                    <th>번호</th>
                    {isPrivateBoard && <th>상태</th>}
                    <th className="text-left">제목</th>
                    <th>날짜</th>
                    <th>작성자</th>
                    <th>조회수</th>
                  </tr>
                </thead>
                <tbody>
                  {posts.length === 0 ? (
                    <tr>
                      <td colSpan={isPrivateBoard ? 6 : 5} className="cb-no-posts">
                        {(isPrivateBoard && !currentUser) ? "로그인이 필요한 서비스입니다." : "등록된 게시글이 없습니다."}
                      </td>
                    </tr>
                  ) : (
                    filteredPosts.map((post, index) => (
                      <tr key={post.id} onClick={() => handlePostClick(post)} className="cb-post-row">
                        <td className="cb-num">{filteredPosts.length - index}</td>
                        
                        {/* Status */}
                        {isPrivateBoard && (
                          <td>
                             {post.hasAdditionalQuestion ? (
                                <span className="cb-badge additional">추가문의</span>
                             ) : post.status === 'completed' ? (
                                <span className="cb-badge completed">완료</span>
                             ) : (
                                <span className="cb-badge pending">대기</span>
                             )}
                          </td>
                        )}

                        {/* Title */}
                        <td className="cb-post-title">
                            <div className="title-inner">
                                {category === 'suggestion' && <span className="lock-icon">🔒</span>}
                                {post.title}
                                {isNewPost(post.createdAt) && <span className="cb-new-dot"></span>}
                                {isPrivateBoard && post.commentCount! > 0 && (
                                   <span className="comment-count">({post.commentCount})</span>
                                )}
                            </div>
                        </td>
                        
                        <td className="cb-date">{formatDate(post.createdAt)}</td>
                        
                        <td>
                            <span className="cb-author" title={post.authorName}>
                                {post.authorName}
                            </span>
                        </td>
                        
                        <td className="cb-views">{post.viewCount || 0}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>

      <Footer />
      {isMobileMenuOpen && isMobile && <MobileMenu onClose={() => setIsMobileMenuOpen(false)} />}

      {/* Modals */}
      {isWriteModalOpen && (
        (category === 'suggestion' || category === 'inquiry') ? (
          <SuggestionWriteModal user={currentUser} category={category} onClose={handleCloseWrite} />
        ) : (
          <BoardWriteModal category={category as 'notice'|'update'} onClose={handleCloseWrite} />
        )
      )}

      {selectedPost && (
        (category === 'suggestion' || category === 'inquiry') ? (
          <SuggestionDetailModal 
            post={selectedPost as any}
            currentUser={currentUser}
            category={category}
            isAdmin={isAdmin}
            onClose={handleCloseDetail} 
          />
        ) : (
          <BoardDetailModal 
            post={selectedPost as any}
            onClose={() => handleCloseDetail()}
            isAdmin={isAdmin}
            onDeleteSuccess={fetchPosts}
          />
        )
      )}
    </div>
  );
};

export default CommunityBoardPage;