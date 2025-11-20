// src/pages/guide/GuideMainPC.tsx

import React, { useState, useEffect } from 'react';
import { 
  getFirestore, collection, query, where, orderBy, getDocs 
} from 'firebase/firestore';
import Header from '../../components/common/Header';
import Footer from '../../components/common/Footer';
import RoleHeader from '../../components/common/RoleHeader';
import MobileMenu from '../../components/common/MobileMenu';
import SubNav from '../../components/common/SubNav';
import './GuideMainPC.css';

interface GuideCategory {
  id: string;
  title: string;
  order: number;
}

interface GuidePost {
  id: string;
  title: string;
  content: string;
  mainCategoryId: string;
  subCategoryId: string;
  order: number;
}

const GuideMainPC: React.FC = () => {
  const db = getFirestore();
  const [selectedMenuKey, setSelectedMenuKey] = useState<string>('');

  const [mainCategories, setMainCategories] = useState<GuideCategory[]>([]);
  const [subCategories, setSubCategories] = useState<GuideCategory[]>([]);
  const [posts, setPosts] = useState<GuidePost[]>([]);

  const [selectedMainId, setSelectedMainId] = useState<string>('');
  const [selectedPostId, setSelectedPostId] = useState<string>(''); // [⭐ 변경] 선택된 글 ID
  const [currentPost, setCurrentPost] = useState<GuidePost | null>(null);

  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // 1. 메인 카테고리 로드
  useEffect(() => {
    const fetchMain = async () => {
      const q = query(collection(db, 'guideMainCategories'), orderBy('order', 'asc'));
      const snap = await getDocs(q);
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() } as GuideCategory));
      setMainCategories(list);
      if (list.length > 0) setSelectedMainId(list[0].id);
    };
    fetchMain();
  }, [db]);

  // 2. 메인 선택 시 -> 서브 카테고리 & 게시글 로드
  useEffect(() => {
    if (!selectedMainId) return;
    
    const fetchData = async () => {
      // (1) 서브 카테고리 (중분류)
      const qSub = query(
        collection(db, 'guideSubCategories'), 
        where('parentId', '==', selectedMainId),
        orderBy('order', 'asc')
      );
      const snapSub = await getDocs(qSub);
      const subs = snapSub.docs.map(d => ({ id: d.id, ...d.data() } as GuideCategory));
      setSubCategories(subs);

      // (2) 게시글 (소분류) - 순서(order) 정렬
      const qPost = query(
        collection(db, 'guidePosts'),
        where('mainCategoryId', '==', selectedMainId),
        orderBy('order', 'asc')
      );
      const snapPost = await getDocs(qPost);
      const postList = snapPost.docs.map(d => ({ id: d.id, ...d.data() } as GuidePost));
      setPosts(postList);

      // (3) 첫 번째 글 자동 선택
      if (postList.length > 0) {
          // 첫 번째 서브카테고리의 첫 번째 글을 찾는 로직 (선택사항)
          // 여기서는 단순히 전체 중 첫 번째 글을 선택
          setSelectedPostId(postList[0].id);
          setCurrentPost(postList[0]);
      } else {
          setSelectedPostId('');
          setCurrentPost(null);
      }
    };
    fetchData();
  }, [selectedMainId, db]);

  // 3. 글 선택 핸들러
  const handlePostClick = (post: GuidePost) => {
    setSelectedPostId(post.id);
    setCurrentPost(post);
  };

  // 반응형
  useEffect(() => {
    const handleResize = () => {
        const mobile = window.innerWidth < 768;
        setIsMobile(mobile);
        if (!mobile) setIsMobileMenuOpen(false);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const handleMenuSelect = (key: string) => setSelectedMenuKey(key);

  return (
    <div className="page-container">
      {!isMobile && <RoleHeader />}
      <Header onMenuSelected={handleMenuSelect} isMobile={isMobile} onHamburgerPressed={() => setIsMobileMenuOpen(true)} />
      {!isMobile && selectedMenuKey && <SubNav selectedMenuKey={selectedMenuKey} />}

      <div className="guide-page-wrapper">
        {/* 상단 탭 */}
        <div className="guide-top-tabs">
          {mainCategories.map(main => (
            <button 
              key={main.id}
              className={`guide-tab-btn ${selectedMainId === main.id ? 'active' : ''}`}
              onClick={() => setSelectedMainId(main.id)}
            >
              {main.title}
            </button>
          ))}
        </div>

        <div className="guide-content-container">
          
          {/* [⭐ 수정] 사이드바 (중분류 -> 소분류(글) 트리 구조) */}
          <aside className="guide-sidebar">
            <h3 style={{paddingLeft:'10px'}}>목차</h3>
            <div className="sidebar-menu-list">
              {subCategories.map(sub => {
                // 해당 서브카테고리에 속한 글들 필터링
                const subPosts = posts.filter(p => p.subCategoryId === sub.id);
                
                return (
                  <div key={sub.id} className="sidebar-group">
                    {/* 중분류 제목 (클릭 X, 헤더 역할) */}
                    <div className="sidebar-group-title">{sub.title}</div>
                    
                    {/* 소분류 (글 제목 리스트) */}
                    <ul className="sidebar-post-list">
                      {subPosts.map(post => (
                        <li 
                          key={post.id} 
                          className={selectedPostId === post.id ? 'active' : ''}
                          onClick={() => handlePostClick(post)}
                        >
                          {post.title}
                        </li>
                      ))}
                      {subPosts.length === 0 && <li className="empty-posts">- 등록된 글 없음 -</li>}
                    </ul>
                  </div>
                );
              })}
              
              {subCategories.length === 0 && <div className="no-menu">메뉴가 없습니다.</div>}
            </div>
          </aside>

          {/* 본문 영역 */}
          <main className="guide-article">
            {currentPost ? (
              <>
                <h2 className="article-title">{currentPost.title}</h2>
                <div className="article-body ql-editor" dangerouslySetInnerHTML={{ __html: currentPost.content }} />
              </>
            ) : (
              <div className="empty-guide"><p>내용을 선택해주세요.</p></div>
            )}
          </main>

        </div>
      </div>

      <Footer />
      {isMobileMenuOpen && isMobile && <MobileMenu onClose={() => setIsMobileMenuOpen(false)} />}
    </div>
  );
};

export default GuideMainPC;