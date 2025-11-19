// src/pages/community/CommunityBoardPage.tsx

import React, { useState, useEffect } from 'react';
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

// 모달 컴포넌트 (common 폴더)
import BoardWriteModal from '../../components/common/BoardWriteModal';       
import BoardDetailModal from '../../components/common/BoardDetailModal';     
import SuggestionWriteModal from '../../components/common/SuggestionWriteModal'; 
import SuggestionDetailModal from '../../components/common/SuggestionDetailModal'; 

// 데이터 타입 정의
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

// 관리자용 필터 타입
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

  // 관리자 필터 (이용 문의용)
  const [adminFilter, setAdminFilter] = useState<AdminFilterType>('all');

  // 모달 상태
  const [isWriteModalOpen, setIsWriteModalOpen] = useState(false);
  const [selectedPost, setSelectedPost] = useState<CommunityPost | null>(null);

  // 1. 반응형 핸들러
  useEffect(() => {
    const handleResize = () => {
      const mobile = window.innerWidth < 768;
      setIsMobile(mobile);
      if (!mobile) setIsMobileMenuOpen(false);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

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
      
      // [기능 제안] & [이용 문의]
      if (category === 'suggestion' || category === 'inquiry') {
        // 리스트는 누구나(회원) 볼 수 있음 (전체 조회)
        const colName = category === 'suggestion' ? 'suggestionPosts' : 'inquiryPosts';
        const collectionRef = collection(db, colName);
        q = query(collectionRef, orderBy('createdAt', 'desc'));

      } else {
        // [공지사항] & [업데이트]
        q = query(
          collection(db, 'adminPosts'), 
          where('category', '==', category), 
          orderBy('createdAt', 'desc')
        );
      }
      
      const snapshot = await getDocs(q);
      let list = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as CommunityPost));
      
      // 공지/업데이트는 관리자가 쓴 글만 필터링 (안전장치)
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

  // 카테고리/유저/관리자여부 변경 시 데이터 리로드
  useEffect(() => {
    fetchPosts();
    setAdminFilter('all'); // 탭 변경 시 필터 초기화
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category, currentUser, isAdmin]);


  // --- 헬퍼 함수들 ---
  const formatDate = (ts: Timestamp) => ts.toDate().toISOString().split('T')[0];

  // 7일 이내 새 글 확인
  const isNewPost = (createdAt: Timestamp) => {
      const now = new Date();
      const postDate = createdAt.toDate();
      const diffTime = Math.abs(now.getTime() - postDate.getTime());
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); 
      return diffDays <= 7;
  };

  // 게시글 클릭 핸들러 (권한 제어 + 조회수)
  const handlePostClick = async (post: CommunityPost) => {
    if (!currentUser) {
      // 공지/업데이트는 비로그인 허용 여부에 따라 다름 (여기선 일단 로그인 필요로 통일)
      if(category !== 'notice' && category !== 'update') {
         alert("로그인이 필요한 서비스입니다.");
         return;
      }
    }

    // [기능 제안] 비공개 (작성자 & 관리자만 열람)
    if (category === 'suggestion') {
        if (!isAdmin && post.authorUid !== currentUser?.uid) {
            alert("비공개 글입니다. 작성자와 관리자만 확인할 수 있습니다.");
            return;
        }
    }
    
    // [이용 문의] 공개 (누구나 열람) - 별도 체크 없음

    setSelectedPost(post);

    // 조회수 증가
    let collectionName = 'adminPosts';
    if (category === 'suggestion') collectionName = 'suggestionPosts';
    if (category === 'inquiry') collectionName = 'inquiryPosts';

    const postRef = doc(db, collectionName, post.id);
    try {
        await updateDoc(postRef, { viewCount: increment(1) });
        // 로컬 상태 업데이트
        post.viewCount = (post.viewCount || 0) + 1;
    } catch (e) { console.error(e); }
  };

  // 헤더 텍스트 설정
  const getHeaderInfo = () => {
    switch (category) {
      case 'notice': return { title: '공지사항', desc: '아워프로젝트의 주요 소식을 알려드립니다.' };
      case 'update': return { title: '업데이트 소식', desc: '새로운 기능과 변경 사항을 확인하세요.' };
      case 'suggestion': return { title: '기능 제안', desc: '필요한 기능이나 개선사항을 제안해주세요.\n(작성하신 글은 목록에만 노출되며 내용은 비공개됩니다.)' };
      case 'inquiry': return { title: '이용 문의', desc: '서비스 이용 중 궁금한 점이나 불편한 점을 문의해주세요.\n(자유롭게 묻고 답할 수 있는 공간입니다.)' };
      default: return { title: '게시판', desc: '' };
    }
  };
  const headerInfo = getHeaderInfo();
  
  // 글쓰기 가능 여부
  const canWrite = (category === 'suggestion' || category === 'inquiry') ? !!currentUser : isAdmin;
  // 개인형 게시판 여부 (상태값 표시용)
  const isPrivateBoard = category === 'suggestion' || category === 'inquiry';

  // 모달 핸들러
  const handleCloseWrite = (refresh: boolean) => { setIsWriteModalOpen(false); if (refresh) fetchPosts(); };
  const handleCloseDetail = (refresh?: boolean) => { setSelectedPost(null); if (refresh) fetchPosts(); };
  const handleMenuSelect = (key: string) => { setSelectedMenuKey(key); };

  // 필터링 된 리스트 (관리자용 필터 적용)
  const filteredPosts = posts.filter(post => {
    if (!isAdmin || category !== 'inquiry') return true; 

    if (adminFilter === 'all') return true;
    if (adminFilter === 'pending') return post.status !== 'completed'; 
    if (adminFilter === 'completed') return post.status === 'completed' && !post.hasAdditionalQuestion; 
    if (adminFilter === 'additional') return post.hasAdditionalQuestion; 
    return true;
  });

  return (
    <div className="page-container"> 
      {!isMobile && <RoleHeader />}
      <Header onMenuSelected={handleMenuSelect} isMobile={isMobile} onHamburgerPressed={() => setIsMobileMenuOpen(true)} />
      {!isMobile && selectedMenuKey && <SubNav selectedMenuKey={selectedMenuKey} />}

      <div className="community-page-wrapper">
        <div className="community-container">
          <div className="community-header">
            <h2>{headerInfo.title}</h2>
            <p style={{whiteSpace: 'pre-line'}}>{headerInfo.desc}</p>
          </div>

          {/* 관리자용 필터 (이용 문의만) */}
          {isAdmin && category === 'inquiry' && (
            <div className="admin-filter-bar">
              <button className={adminFilter === 'all' ? 'active' : ''} onClick={() => setAdminFilter('all')}>전체</button>
              <button className={adminFilter === 'pending' ? 'active' : ''} onClick={() => setAdminFilter('pending')}>답변대기</button>
              <button className={adminFilter === 'additional' ? 'active' : ''} onClick={() => setAdminFilter('additional')}>추가문의</button>
              <button className={adminFilter === 'completed' ? 'active' : ''} onClick={() => setAdminFilter('completed')}>답변완료</button>
            </div>
          )}

          {canWrite && (
            <div className="board-action-bar">
              <button className="btn-write-community" onClick={() => setIsWriteModalOpen(true)}>
                + {category === 'inquiry' ? '문의하기' : category === 'suggestion' ? '제안하기' : '글쓰기'}
              </button>
            </div>
          )}

          {isLoading ? (
            <div style={{textAlign:'center', padding:'50px', color:'#999'}}>로딩 중...</div>
          ) : (
            <div className="board-list-wrapper">
              <table className="community-table">
                <colgroup>
                  <col style={{width: '60px'}} /> 
                  {isPrivateBoard && <col style={{width: '100px'}} />} 
                  <col /> 
                  <col style={{width: '120px'}} /> 
                  {/* [⭐ 수정] 작성자 칸 너비 확보 (130px) */}
                  <col style={{width: '130px'}} />
                  <col style={{width: '80px'}} />
                </colgroup>
                <thead>
                  <tr>
                    <th>No</th>
                    {isPrivateBoard && <th>상태</th>}
                    <th>제목</th>
                    <th>작성일</th>
                    <th>작성자</th>
                    <th>조회</th>
                  </tr>
                </thead>
                <tbody>
                  {posts.length === 0 ? (
                    <tr>
                      <td colSpan={isPrivateBoard ? 6 : 5} className="no-posts">
                        {(isPrivateBoard && !currentUser) ? "로그인이 필요한 서비스입니다." : "등록된 게시글이 없습니다."}
                      </td>
                    </tr>
                  ) : (
                    filteredPosts.map((post, index) => (
                      <tr key={post.id} onClick={() => handlePostClick(post)} className="post-row">
                        <td>{filteredPosts.length - index}</td>
                        
                        {/* 상태 뱃지 */}
                        {isPrivateBoard && (
                          <td>
                             {post.hasAdditionalQuestion ? (
                                <div style={{display:'flex', gap:'5px', justifyContent:'center'}}>
                                    <span className="status-badge completed">답변완료</span>
                                    <span className="status-badge additional">추가문의</span>
                                </div>
                             ) : post.status === 'completed' ? (
                                <span className="status-badge completed">답변완료</span>
                             ) : (
                                <span className="status-badge pending">
                                    {category === 'inquiry' ? '답변대기' : '검토중'}
                                </span>
                             )}
                          </td>
                        )}

                        {/* 제목 */}
                        <td className="post-title">
                            {category === 'suggestion' && "🔒 "}
                            {post.title}
                            
                            {isNewPost(post.createdAt) && (
                                <span className="new-icon">N</span>
                            )}

                            {isPrivateBoard && post.commentCount! > 0 && (
                               <span style={{color:'#ff5722', fontSize:'12px', marginLeft:'5px', fontWeight:'bold'}}>
                                 ({post.commentCount})
                               </span>
                            )}
                        </td>
                        <td>{formatDate(post.createdAt)}</td>
                        
                        {/* [⭐ 수정] 작성자 (말줄임표 클래스 적용) */}
                        <td>
                            <span className="post-author" title={post.authorName}>
                                {post.authorName}
                            </span>
                        </td>
                        
                        <td style={{color:'#888'}}>{post.viewCount || 0}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      <Footer />
      {isMobileMenuOpen && isMobile && <MobileMenu onClose={() => setIsMobileMenuOpen(false)} />}

      {/* 모달 렌더링 */}
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