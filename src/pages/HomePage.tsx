import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import './HomePage.css'; 

// [슬라이드 데이터]
const SLIDES = [
  { 
    id: 1, 
    img: "https://images.unsplash.com/photo-1600210492486-724fe5c67fb0?q=80&w=2600&auto=format&fit=crop", 
    title: "완벽한 공사를 위한\n최고의 선택", // 줄바꿈을 위해 \n 사용
    desc: "공사에만 온전히 집중하세요.\n나머지는 730디자인그룹가 해결합니다." 
  },
  { 
    id: 2, 
    img: "https://images.unsplash.com/photo-1497366216548-37526070297c?q=80&w=2600&auto=format&fit=crop", 
    title: "고객과 업체의\n단단한 신뢰", 
    desc: "730디자인그룹 ERP 시스템으로\n투명하고 안전한 공사를 경험하세요." 
  },
  { 
    id: 3, 
    img: "https://images.unsplash.com/photo-1600596542815-e328700336f4?q=80&w=2600&auto=format&fit=crop", 
    title: "데이터로 증명하는\n안전 플랫폼", 
    desc: "시작부터 끝까지,\n고객이 안심할 수 있는 기준을 만듭니다." 
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
  { id: '01', title: "견적 시스템", desc: "빅데이터를 기반으로 산출하는\n투명하고 합리적인 예산" },
  { id: '02', title: "공정 관리", desc: "현장의 진행 상황을\n실시간 리포트로 한눈에 확인" },
  { id: '03', title: "품질 감리", desc: "업계 최고 전문가가 체크하는\n빈틈없는 시공 디테일" },
  { id: '04', title: "안전 결제", desc: "단계별 지급 시스템으로\n소중한 공사 대금을 안전하게 보호" }
];

const HomePage: React.FC = () => {
  const navigate = useNavigate();
  
  // 슬라이더 상태
  const [currentSlide, setCurrentSlide] = useState(0);
  const sliderRef = useRef<HTMLDivElement>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);

  useEffect(() => {
    // 슬라이드 자동 재생 (5초)
    const slideInterval = setInterval(() => {
      setCurrentSlide((prev) => (prev + 1) % SLIDES.length);
    }, 5000);

    // 스크롤 애니메이션 옵저버 (IntersectionObserver)
    observerRef.current = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('in-view');
        }
      });
    }, { threshold: 0.15, rootMargin: "0px 0px -50px 0px" }); // 트리거 민감도 조정

    const targets = document.querySelectorAll('.animate-on-scroll');
    targets.forEach(el => observerRef.current?.observe(el));

    return () => {
      clearInterval(slideInterval);
      observerRef.current?.disconnect();
    };
  }, []);

  // 슬라이드 수동 이동
  const goToSlide = (index: number) => {
    setCurrentSlide(index);
  };

  return (
    <div className="home-wrapper">
      <main className="main-content">
        
        {/* 1. Hero Slider Section */}
        <section className="hero-section" ref={sliderRef}>
          {SLIDES.map((slide, index) => (
            <div 
              key={slide.id} 
              className={`hero-slide ${index === currentSlide ? 'active' : ''}`}
            >
              <div className="hero-bg-wrapper">
                <div className="hero-bg" style={{ backgroundImage: `url(${slide.img})` }}></div>
                <div className="hero-overlay"></div>
              </div>
              
              <div className="hero-content container">
                <div className="text-group">
                  <h2 className={`hero-title ${index === currentSlide ? 'reveal' : ''}`}>
                    {slide.title.split('\n').map((line, i) => (
                      <span key={i} className="block-text">{line}</span>
                    ))}
                  </h2>
                  <p className={`hero-desc ${index === currentSlide ? 'reveal delay-1' : ''}`}>
                    {slide.desc.split('\n').map((line, i) => (
                      <React.Fragment key={i}>{line}<br/></React.Fragment>
                    ))}
                  </p>
                  <div className={`btn-wrapper ${index === currentSlide ? 'reveal delay-2' : ''}`}>
                    <button 
                      className="btn-hero-primary"
                      onClick={() => navigate('/guide/apply')}
                    >
                      파트너 신청하기
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}
          
          {/* Slider Indicators */}
          <div className="hero-indicators">
            {SLIDES.map((_, idx) => (
              <button 
                key={idx} 
                className={`indicator-dot ${idx === currentSlide ? 'active' : ''}`}
                onClick={() => goToSlide(idx)}
                aria-label={`${idx + 1}번 슬라이드로 이동`}
              >
                <span className="dot-fill"></span>
              </button>
            ))}
          </div>
        </section>

        {/* 2. Brand Intro Section */}
        <section className="section-intro">
          <div className="container animate-on-scroll fade-up">
            <span className="section-label">730디자인그룹 비전</span>
            <h2 className="intro-heading">
              불투명했던 공사의 기준을<br />
              <span className="text-accent">데이터와 시스템</span>으로<br />
              완벽하게 바꿉니다.
            </h2>
            <p className="intro-desc">
              견적부터 마감까지, 모든 과정이 투명하게 기록됩니다.<br />
              불안함은 시스템에 맡기고, 당신은 공간의 가치에만 집중하세요.
            </p>
          </div>
        </section>

        {/* 3. Projects Section */}
        <section className="section-projects bg-gray">
          <div className="container">
            <div className="section-header animate-on-scroll fade-up">
              <h2 className="section-title">주요 프로젝트</h2>
              <button className="btn-text-link">전체 보기</button>
            </div>
            
            <div className="projects-grid">
              {PROJECTS.map((project, idx) => (
                <div key={project.id} className="project-card animate-on-scroll fade-up" style={{ transitionDelay: `${idx * 0.1}s` }}>
                  <div className="card-image-wrapper">
                    <img src={project.img} alt={project.title} loading="lazy" />
                    <div className="hover-curtain">
                      <span className="view-text">상세 보기</span>
                    </div>
                  </div>
                  <div className="card-info">
                    <span className="card-category">{project.category}</span>
                    <h3 className="card-title">{project.title}</h3>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* 4. Core Solutions Section */}
        <section className="section-solutions">
          <div className="container">
            <div className="section-header animate-on-scroll fade-up">
              <h2 className="section-title">핵심 솔루션</h2>
              <p className="section-subtitle">성공적인 공간을 완성하는 4가지 약속</p>
            </div>
            
            <div className="solutions-grid">
              {SERVICES.map((item, idx) => (
                <div key={item.id} className="solution-card animate-on-scroll fade-up" style={{ transitionDelay: `${idx * 0.1}s` }}>
                  <div className="card-top">
                    <span className="solution-num">{item.id}</span>
                  </div>
                  <div className="card-body">
                    <h4 className="solution-title">{item.title}</h4>
                    <p className="solution-desc">
                        {item.desc.split('\n').map((line, i) => (
                          <React.Fragment key={i}>{line}<br/></React.Fragment>
                        ))}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* 5. CTA (Call to Action) Section */}
        <section className="section-cta">
          <div className="container animate-on-scroll scale-up">
            <div className="cta-box">
              <h2 className="cta-title">
                가장 완벽한 공간 경험,<br />
                지금 시작하세요.
              </h2>
              <p className="cta-desc">
                730디자인그룹과 함께라면 인테리어는 더 이상 걱정거리가 아닙니다.
              </p>
              <button className="btn-cta-primary" onClick={() => navigate('/guide/apply')}>
                파트너 신청하기
              </button>
            </div>
          </div>
        </section>

      </main>
    </div>
  );
};

export default HomePage;