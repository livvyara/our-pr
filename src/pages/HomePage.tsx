import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import Header from '../components/common/Header';
import SubNav from '../components/common/SubNav';
import MobileMenu from '../components/common/MobileMenu';
import Footer from '../components/common/Footer';
import RoleHeader from '../components/common/RoleHeader';
import { useMenu } from '../contexts/MenuContext';
import './HomePage.css'; 

// [Dummy Data] 풍부한 콘텐츠를 위한 임시 데이터
const PROJECTS = [
  { id: 1, title: "Hannam The Hill", category: "Residential", img: "https://images.unsplash.com/photo-1600210492486-724fe5c67fb0?q=80&w=1600&auto=format&fit=crop" },
  { id: 2, title: "Seongsu Art Space", category: "Commercial", img: "https://images.unsplash.com/photo-1554995207-c18c203602cb?q=80&w=1600&auto=format&fit=crop" },
  { id: 3, title: "Gangnam Office", category: "Workspace", img: "https://images.unsplash.com/photo-1497366216548-37526070297c?q=80&w=1600&auto=format&fit=crop" },
  { id: 4, title: "Jeju Villa", category: "Residential", img: "https://images.unsplash.com/photo-1600596542815-e328700336f4?q=80&w=1600&auto=format&fit=crop" }
];

const REVIEWS = [
  { id: 1, text: "복잡한 공사 과정이 이렇게 투명하게 관리될 줄 몰랐습니다. 최고의 경험이었습니다.", author: "Kim Min-jun", role: "Home Owner" },
  { id: 2, text: "디자이너로서 시공팀과의 소통이 항상 어려웠는데, 아워프로젝트 덕분에 완벽한 결과물을 만들었습니다.", author: "Lee Seo-yeon", role: "Interior Designer" },
  { id: 3, text: "일정 관리부터 정산까지, 플랫폼 하나로 해결되니 업무 효율이 200% 올랐습니다.", author: "Park Ji-hoon", role: "Construction Partner" }
];

const ARTICLES = [
  { id: 1, title: "2025 인테리어 트렌드: 지속 가능한 공간", date: "Oct 12, 2024", img: "https://images.unsplash.com/photo-1513694203232-719a280e022f?q=80&w=800&auto=format&fit=crop" },
  { id: 2, title: "스마트 오피스, 업무 효율을 바꾸다", date: "Sep 28, 2024", img: "https://images.unsplash.com/photo-1497215728101-856f4ea42174?q=80&w=800&auto=format&fit=crop" },
  { id: 3, title: "하이엔드 주거 공간의 새로운 기준", date: "Sep 15, 2024", img: "https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?q=80&w=800&auto=format&fit=crop" }
];

const FAQS = [
  { q: "아워프로젝트의 파트너 선정 기준은 무엇인가요?", a: "우리는 엄격한 포트폴리오 심사와 신용 평가, 그리고 현장 실사 인터뷰를 거친 상위 10%의 전문가와 파트너십을 맺고 있습니다." },
  { q: "공사 중 발생하는 추가 비용은 어떻게 관리되나요?", a: "모든 추가 비용은 플랫폼 내에서 투명하게 승인 절차를 거쳐야 하며, 사전 협의되지 않은 비용 청구는 시스템적으로 불가능합니다." },
  { q: "A/S 보증 기간은 어떻게 되나요?", a: "기본적으로 관련 법령에 따른 1년의 하자 보수 기간을 보장하며, 파트너사와의 계약 조건에 따라 최대 3년까지 연장 가능합니다." }
];

const HomePage: React.FC = () => {
  const navigate = useNavigate();
  const { mainMenus, isLoading } = useMenu();
  const [selectedMenu, setSelectedMenu] = useState('');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  
  // 스크롤 애니메이션 Ref
  const observerRef = useRef<IntersectionObserver | null>(null);

  useEffect(() => {
    if (!isLoading && mainMenus.length > 0 && selectedMenu === '') {
      setSelectedMenu(mainMenus[0].key);
    }
  }, [isLoading, mainMenus, selectedMenu]);

  useEffect(() => {
    const handleResize = () => {
      const isCurrentlyMobile = window.innerWidth < 768;
      setIsMobile(isCurrentlyMobile);
      if (!isCurrentlyMobile) setIsMobileMenuOpen(false);
    };
    window.addEventListener('resize', handleResize);

    // Scroll Animation Observer
    observerRef.current = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('active');
        }
      });
    }, { threshold: 0.1 });

    const fadeElements = document.querySelectorAll('.hp-fade-up');
    fadeElements.forEach(el => observerRef.current?.observe(el));

    return () => {
      window.removeEventListener('resize', handleResize);
      observerRef.current?.disconnect();
    };
  }, []);

  return (
    <div className="home-page-container">
      {!isMobile && <RoleHeader />}
      <Header onMenuSelected={setSelectedMenu} isMobile={isMobile} onHamburgerPressed={() => setIsMobileMenuOpen(true)} />
      {!isMobile && selectedMenu && <SubNav selectedMenuKey={selectedMenu} />}

      <main className="hp-main">
        
        {/* 1. Hero Section: 압도적인 비주얼과 메시지 */}
        <section className="hp-hero">
          <div className="hp-hero-bg" style={{ backgroundImage: 'url(https://images.unsplash.com/photo-1618221195710-dd6b41faaea6?q=80&w=2600&auto=format&fit=crop)' }}></div>
          <div className="hp-hero-content hp-fade-up">
            <p className="hp-hero-label">The New Standard of Interior</p>
            <h1 className="hp-hero-title">
              Beyond<br/>Construction.
            </h1>
            <p className="hp-hero-desc">
              단순한 시공을 넘어, 공간의 가치를 창조합니다.<br/>
              데이터 기반의 투명한 관리로 완벽한 결과를 경험하세요.
            </p>
            <div className="hp-btn-group">
              <button className="hp-btn-primary" onClick={() => navigate('/guide/apply')}>파트너 지원</button>
              <button className="hp-btn-primary" onClick={() => navigate('/guide/mainpc')}>이용안내</button>
            </div>
          </div>
        </section>

        {/* 2. Philosophy: 브랜드 철학 (텍스트 중심) */}
        <section className="hp-section hp-philosophy">
          <div className="hp-container">
            <div className="hp-split-text">
              <h2 className="hp-fade-up">
                We believe in <br/>
                <span className="hp-accent">Transparency</span> & <span className="hp-accent">Trust</span>.
              </h2>
              <div className="hp-text-body hp-fade-up">
                <p>
                  인테리어 시장의 불투명함과 <br></br>불안정성을 해결하기 위해 만들었습니다.<br></br><br></br>
                  모든 과정을 데이터화하여 <br></br>고객과 전문가 모두가 신뢰할 수 있는 환경을 만듭니다.<br></br>
                </p>
                <p>
                  아워프로젝트는 단순한 중개 플랫폼이 아닙니다.<br></br>
                  성공적인 프로젝트를 위한 파트너입니다.
                </p>
                <div className="hp-stat-row">
                  <div className="hp-stat">
                    <strong>1,200+</strong> <span>Projects</span>
                  </div>
                  <div className="hp-stat">
                    <strong>98%</strong> <span>Satisfaction</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* 3. Featured Projects: 포트폴리오 갤러리 */}
        <section className="hp-section hp-projects">
          <div className="hp-container">
            <div className="hp-section-header hp-fade-up">
              <h3>Selected Works</h3>
              <button className="hp-link-btn">View All Projects →</button>
            </div>
            <div className="hp-project-grid">
              {PROJECTS.map((project) => (
                <div key={project.id} className="hp-project-card hp-fade-up">
                  <div className="hp-card-img-wrap">
                    <img src={project.img} alt={project.title} />
                    <div className="hp-card-overlay">
                      <span>View Details</span>
                    </div>
                  </div>
                  <div className="hp-card-info">
                    <span className="hp-category">{project.category}</span>
                    <h4>{project.title}</h4>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* 4. Our Services: 서비스 소개 (가로 스크롤/그리드) */}
        <section className="hp-section hp-services-bg">
          <div className="hp-container">
            <div className="hp-section-header center hp-fade-up">
              <h3>Our Services</h3>
              <p>성공적인 공간 구축을 위한 End-to-End 솔루션</p>
            </div>
            <div className="hp-service-list">
              <div className="hp-service-item hp-fade-up">
                <div className="hp-service-icon">01</div>
                <h4>Estimation System</h4>
                <p>빅데이터 기반의 표준 견적 시스템으로<br/>예산의 오차 범위를 최소화합니다.</p>
              </div>
              <div className="hp-service-item hp-fade-up">
                <div className="hp-service-icon">02</div>
                <h4>Process Management</h4>
                <p>모바일로 실시간 공유되는 공정표와<br/>현장 리포트로 진행 상황을 체크하세요.</p>
              </div>
              <div className="hp-service-item hp-fade-up">
                <div className="hp-service-icon">03</div>
                <h4>Quality Control</h4>
                <p>자체 감리 시스템과 체크리스트를 통해<br/>시공 품질을 철저하게 검수합니다.</p>
              </div>
              <div className="hp-service-item hp-fade-up">
                <div className="hp-service-icon">04</div>
                <h4>Escrow Safety</h4>
                <p>공정 단계별 결제 시스템(에스크로)으로<br/>금전 사고를 원천 차단합니다.</p>
              </div>
            </div>
          </div>
        </section>

        {/* 5. Reviews: 고객 후기 (슬라이드 느낌) */}
        <section className="hp-section hp-reviews">
          <div className="hp-container">
            <h3 className="hp-fade-up">Client Voices</h3>
            <div className="hp-review-grid">
              {REVIEWS.map((review) => (
                <div key={review.id} className="hp-review-card hp-fade-up">
                  <div className="hp-quote">“</div>
                  <p className="hp-review-text">{review.text}</p>
                  <div className="hp-review-author">
                    <strong>{review.author}</strong>
                    <span>{review.role}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* 6. Magazine/Insights: 아티클 섹션 */}
        <section className="hp-section hp-magazine">
          <div className="hp-container">
            <div className="hp-section-header hp-fade-up">
              <h3>Latest Insights</h3>
              <p>공간에 대한 새로운 시각과 트렌드</p>
            </div>
            <div className="hp-article-list">
              {ARTICLES.map((article) => (
                <div key={article.id} className="hp-article-item hp-fade-up">
                  <div className="hp-article-img">
                    <img src={article.img} alt={article.title} />
                  </div>
                  <div className="hp-article-content">
                    <span className="hp-article-date">{article.date}</span>
                    <h4>{article.title}</h4>
                    <button className="hp-read-more">Read Article</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* 7. FAQ: 자주 묻는 질문 (아코디언) */}
        <section className="hp-section hp-faq">
          <div className="hp-container-narrow">
            <h3 className="hp-fade-up text-center">FAQ</h3>
            <div className="hp-faq-list">
              {FAQS.map((faq, idx) => (
                <details key={idx} className="hp-faq-item hp-fade-up">
                  <summary className="hp-faq-q">
                    {faq.q}
                    <span className="hp-icon">+</span>
                  </summary>
                  <div className="hp-faq-a">
                    <p>{faq.a}</p>
                  </div>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* 8. Final CTA */}
        <section className="hp-final-cta">
          <div className="hp-cta-content hp-fade-up">
            <h2>Start Your Project Today</h2>
            <p>가장 안전하고 완벽한 인테리어의 시작, 아워프로젝트</p>
            <button className="hp-btn-white" onClick={() => navigate('/login')}>
              지금 무료로 견적 받기
            </button>
          </div>
        </section>

      </main>

      <Footer />
      {isMobileMenuOpen && isMobile && <MobileMenu onClose={() => setIsMobileMenuOpen(false)} />}
    </div>
  );
};

export default HomePage;