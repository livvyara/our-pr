import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import Header from '../components/common/Header';
import SubNav from '../components/common/SubNav';
import MobileMenu from '../components/common/MobileMenu';
import Footer from '../components/common/Footer';
import RoleHeader from '../components/common/RoleHeader';
import { useMenu } from '../contexts/MenuContext';
import './HomePage.css'; 

// [슬라이드 데이터 - 요청하신 문구 반영]
const SLIDES = [
  { 
    id: 1, 
    img: "https://images.unsplash.com/photo-1600210492486-724fe5c67fb0?q=80&w=2600&auto=format&fit=crop", 
    title: "완벽한 공사를 위한 최고의 선택", 
    desc: "공사에 더 집중할 수 있도록. 아워프로젝트" 
  },
  { 
    id: 2, 
    img: "https://images.unsplash.com/photo-1497366216548-37526070297c?q=80&w=2600&auto=format&fit=crop", 
    title: "고객과 업체의 상호 신뢰를 위한 기본", 
    desc: "아워프로젝트 ERP로 공사를 진행해 보세요." 
  },
  { 
    id: 3, 
    img: "https://images.unsplash.com/photo-1600596542815-e328700336f4?q=80&w=2600&auto=format&fit=crop", 
    title: "아워프로젝트는 신뢰 기반 ERP플랫폼 입니다.", 
    desc: "고객이 더 안심할 수 있는 안전플랫폼 아워프로젝트" 
  }
];

// [프로젝트 데이터]
const PROJECTS = [
  { id: 1, title: "성수 아틀리에", category: "상업 공간", img: "https://images.unsplash.com/photo-1554995207-c18c203602cb?q=80&w=1600&auto=format&fit=crop" },
  { id: 2, title: "판교 IT 오피스", category: "업무 공간", img: "https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?q=80&w=1600&auto=format&fit=crop" },
  { id: 3, title: "청담동 쇼룸", category: "상업 공간", img: "https://images.unsplash.com/photo-1618221195710-dd6b41faaea6?q=80&w=1600&auto=format&fit=crop" }
];

// [서비스 데이터]
const SERVICES = [
  { id: '01', title: "견적 시스템", desc: "빅데이터 기반의 투명한 예산 산출" },
  { id: '02', title: "공정 관리", desc: "실시간으로 확인하는 현장 리포트" },
  { id: '03', title: "품질 감리", desc: "전문가가 체크하는 시공 디테일" },
  { id: '04', title: "안전 결제", desc: "단계별 지급으로 안전한 대금 보호" }
];

const HomePage: React.FC = () => {
  const navigate = useNavigate();
  const { mainMenus, isLoading } = useMenu();
  const [selectedMenu, setSelectedMenu] = useState('');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  
  // 슬라이더 상태
  const [currentSlide, setCurrentSlide] = useState(0);
  const sliderRef = useRef<HTMLDivElement>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);

  useEffect(() => {
    if (!isLoading && mainMenus.length > 0 && selectedMenu === '') setSelectedMenu(mainMenus[0].key);
  }, [isLoading, mainMenus, selectedMenu]);

  useEffect(() => {
    const handleResize = () => {
      const mobile = window.innerWidth < 768;
      setIsMobile(mobile);
      if (!mobile) setIsMobileMenuOpen(false);
    };
    window.addEventListener('resize', handleResize);

    // 슬라이드 자동 재생 (5초)
    const slideInterval = setInterval(() => {
      setCurrentSlide((prev) => (prev + 1) % SLIDES.length);
    }, 5000);

    // 스크롤 애니메이션 옵저버
    observerRef.current = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) entry.target.classList.add('in-view');
      });
    }, { threshold: 0.1 });

    const targets = document.querySelectorAll('.fade-up, .scale-in');
    targets.forEach(el => observerRef.current?.observe(el));

    return () => {
      window.removeEventListener('resize', handleResize);
      clearInterval(slideInterval);
      observerRef.current?.disconnect();
    };
  }, []);

  // 슬라이드 수동 이동
  const goToSlide = (index: number) => {
    setCurrentSlide(index);
  };

  return (
    <div className="home-page-container atelier-theme">


      <main className="a-main">
        
        {/* 1. Hero Slider (필수 요청 사항) */}
        <section className="a-hero-slider" ref={sliderRef}>
          {SLIDES.map((slide, index) => (
            <div 
              key={slide.id} 
              className={`a-slide-item ${index === currentSlide ? 'active' : ''}`}
            >
              <div className="a-slide-bg" style={{ backgroundImage: `url(${slide.img})` }}></div>
              <div className="a-slide-overlay"></div>
              <div className="a-slide-content">
                <div className="a-container">
                  <h2 className={`a-slide-title ${index === currentSlide ? 'animate' : ''}`}>
                    {slide.title}
                  </h2>
                  <p className={`a-slide-desc ${index === currentSlide ? 'animate delay' : ''}`}>
                    {slide.desc}
                  </p>
                  <button 
                    className={`a-slide-btn ${index === currentSlide ? 'animate delay-2' : ''}`}
                    onClick={() => navigate('/guide/apply')}
                  >
                    파트너 신청하기
                  </button>
                </div>
              </div>
            </div>
          ))}
          
          {/* 슬라이드 인디케이터 (Dots) */}
          <div className="a-slide-dots">
            {SLIDES.map((_, idx) => (
              <button 
                key={idx} 
                className={`a-dot ${idx === currentSlide ? 'active' : ''}`}
                onClick={() => goToSlide(idx)}
              ></button>
            ))}
          </div>
        </section>

        {/* 2. Brand Intro */}
        <section className="a-section a-intro">
          <div className="a-container center">
            <span className="a-label fade-up">아워프로젝트</span>
            <h2 className="a-heading fade-up">
              완벽한 ERP로 증명하는<br/>
              투명한 인테리어의 기준
            </h2>
            <p className="a-desc fade-up">
              불투명한 견적과 불안한 공정 과정,<br/>
              이제 시스템으로 관리되는 <br/>완벽한 경험을 만나보세요.
            </p>
          </div>
        </section>

        {/* 3. Projects Gallery */}
        <section className="a-section bg-light">
          <div className="a-container">
            <div className="a-header-row fade-up">
              <h2 className="a-section-title">주요 프로젝트</h2>
              <button className="a-link-btn">전체보기 →</button>
            </div>
            
            <div className="a-project-grid">
              {PROJECTS.map((project) => (
                <div key={project.id} className="a-project-card fade-up">
                  <div className="a-img-wrap">
                    <img src={project.img} alt={project.title} />
                    <div className="a-img-hover">
                      <span>프로젝트 보기</span>
                    </div>
                  </div>
                  <div className="a-card-info">
                    <span className="a-cat">{project.category}</span>
                    <h3 className="a-title">{project.title}</h3>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* 4. Core Services */}
        <section className="a-section">
          <div className="a-container">
            <div className="a-header-row fade-up">
              <h2 className="a-section-title">핵심 솔루션</h2>
              <p className="a-header-desc">성공적인 공간을 위한 4가지 약속</p>
            </div>
            
            <div className="a-service-list">
              {SERVICES.map((item) => (
                <div key={item.id} className="a-service-item fade-up">
                  <span className="s-num">{item.id}</span>
                  <div className="s-text">
                    <h4>{item.title}</h4>
                    <p>{item.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* 5. CTA Section */}
        <section className="a-cta">
          <div className="a-cta-bg"></div>
          <div className="a-cta-content fade-up">
            <h2>시작할 준비가 되셨나요?</h2>
            <p>가장 안전하고 완벽한 공간 경험을 지금 시작하세요.</p>
            <button className="a-btn-solid" onClick={() => navigate('/guide/apply')}>
              파트너 신청하기
            </button>
          </div>
        </section>

      </main>

    </div>
  );
};

export default HomePage;