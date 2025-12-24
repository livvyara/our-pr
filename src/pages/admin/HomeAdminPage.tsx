import React, { useState, useEffect, useRef, useMemo } from 'react';
import { getFirestore, doc, getDoc, setDoc } from 'firebase/firestore';
import { 
  Plus, Trash, Save, Settings, MapPin, CheckCircle, 
  ChevronDown, ChevronUp, GripVertical, ArrowUp, ArrowDown,
  User, Briefcase, Wrench, Store, Calculator, Grid, Search, MessageCircle,
  Hammer, HardHat, PaintBucket, Ruler, Truck, Warehouse, BrickWall, Construction,
  Home, Sofa, BedDouble, Lamp, Armchair, Bath, Droplets, Utensils,
  CreditCard, Wallet, BadgeDollarSign, Receipt, ClipboardCheck,
  Calendar, Clock, Hourglass, Timer,
  Phone, Mail, Star, Heart, Camera, Image, ShieldCheck, Zap
} from 'lucide-react';

import ReactQuill, { Quill } from 'react-quill-new';
import 'react-quill-new/dist/quill.snow.css';

import type { SurveyStep, SurveyOption } from '../HomePage'; 
import './HomeAdminPage.css';

// [수정된 부분] TypeScript 오류 해결을 위해 'as any' 추가
const Size = Quill.import('attributors/style/size') as any;
const customSizes = ['10px', '12px', '14px', '16px', '18px', '20px', '24px', '28px', '32px', '36px', '42px'];
Size.whitelist = customSizes;
Quill.register(Size, true);

// --- [Admin Icon Map] ---
const ADMIN_ICON_MAP: { [key: string]: React.ComponentType<any> } = {
  User, Briefcase, Wrench, Store, Calculator, Grid, Search, MessageCircle,
  Hammer, HardHat, PaintBucket, Ruler, Truck, Warehouse, BrickWall, Construction,
  Home, Sofa, BedDouble, Lamp, Armchair, Bath, Droplets, Utensils,
  CreditCard, Wallet, BadgeDollarSign, Receipt, ClipboardCheck,
  Calendar, Clock, Hourglass, Timer,
  Phone, Mail, Star, Heart, Camera, Image, ShieldCheck, Zap
};

// --- [Visual Icon Selector] ---
const IconSelector: React.FC<{ value: string; onChange: (iconKey: string) => void; }> = ({ value, onChange }) => {
  const [isOpen, setIsOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) { setIsOpen(false); }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const SelectedIcon = ADMIN_ICON_MAP[value] || null;

  return (
    <div className="ha-icon-picker-wrapper" ref={wrapperRef}>
      <button className={`ha-icon-trigger ${isOpen ? 'active' : ''}`} onClick={() => setIsOpen(!isOpen)} title="아이콘 변경">
        {SelectedIcon ? <SelectedIcon size={18} /> : <div className="ha-dot-empty" />}
        <ChevronDown size={12} className="ha-trigger-arrow"/>
      </button>

      {isOpen && (
        <div className="ha-icon-grid-popup animate-fade-in">
          {Object.keys(ADMIN_ICON_MAP).map((iconKey) => {
            const IconComp = ADMIN_ICON_MAP[iconKey];
            return (
              <button key={iconKey} className={`ha-icon-grid-item ${value === iconKey ? 'selected' : ''}`}
                onClick={() => { onChange(iconKey); setIsOpen(false); }} title={iconKey}>
                <IconComp size={20} />
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

// --- [StepCard Component] ---
const StepCard: React.FC<{
  step: SurveyStep;
  steps: Record<string, SurveyStep>;
  index: number;
  totalSteps: number;
  onUpdate: (id: string, field: keyof SurveyStep, value: any) => void;
  onDelete: (id: string) => void;
  onAddOption: (id: string) => void;
  onUpdateOption: (id: string, idx: number, field: keyof SurveyOption, value: any) => void;
  onDeleteOption: (id: string, idx: number) => void;
  onTypeChange: (id: string, idx: number, type: 'link' | 'step') => void;
  onMove: (id: string, direction: 'up' | 'down') => void;
}> = ({ step, steps, index, totalSteps, onUpdate, onDelete, onAddOption, onUpdateOption, onDeleteOption, onTypeChange, onMove }) => {
  
  const [isExpanded, setIsExpanded] = useState(false);
  
  const sortedStepsList = Object.values(steps).sort((a,b)=>(a.order||0)-(b.order||0));
  const displayTitle = step.adminTitle 
    ? `[${step.adminTitle}]` 
    : (step.question ? step.question.substring(0, 20) + (step.question.length > 20 ? '...' : '') : '(제목 없음)');

  const quillModules = useMemo(() => ({
    toolbar: [
      [{ 'size': customSizes }], 
      [{ 'color': [] }, { 'background': [] }],
      ['bold', 'italic', 'underline', 'strike'], 
      [{ 'align': [] }],
      [{ 'list': 'ordered'}, { 'list': 'bullet' }],
      ['link', 'image'],
      ['clean'] 
    ],
  }), []);

  return (
    <div className={`ha-step-card type-${step.type} ${isExpanded ? 'expanded' : 'collapsed'}`}>
      <div className="ha-card-header" onClick={() => setIsExpanded(!isExpanded)}>
        <div className="ha-header-left">
          <button className="ha-btn-toggle">
            {isExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
          </button>
          <div className="ha-step-info">
            <div className="ha-step-badges">
              <span className="ha-step-order-badge">#{index + 1}</span>
              <span className="ha-step-type-badge">{step.type}</span>
            </div>
            <span className="ha-step-title-preview">{displayTitle}</span>
          </div>
        </div>
        <div className="ha-header-right" onClick={(e) => e.stopPropagation()}>
          <div className="ha-order-btns">
            <button onClick={() => onMove(step.id, 'up')} disabled={index === 0} className="ha-btn-icon"><ArrowUp size={16} /></button>
            <button onClick={() => onMove(step.id, 'down')} disabled={index === totalSteps - 1} className="ha-btn-icon"><ArrowDown size={16} /></button>
          </div>
          {step.id !== 'start' && <button onClick={() => onDelete(step.id)} className="ha-btn-icon delete"><Trash size={16} /></button>}
        </div>
      </div>

      {isExpanded && (
        <div className="ha-card-body animate-slide-down">
          <div className="ha-row">
            <div className="ha-col flex-2">
              <label className="ha-label-highlight">관리자용 제목</label>
              <input type="text" value={step.adminTitle || ''} onChange={(e) => onUpdate(step.id, 'adminTitle', e.target.value)} className="ha-input-text admin-title-input" placeholder="예: Step 1. 시공 종류"/>
            </div>
            <div className="ha-col flex-1">
              <label>질문 유형</label>
              <select value={step.type || 'choice'} onChange={(e) => onUpdate(step.id, 'type', e.target.value)} className="ha-input-select">
                <option value="choice">🔵 버튼 선택형</option>
                <option value="region">🟢 지역 선택형</option>
                <option value="auth_gate">🔒 로그인 게이트</option>
                <option value="result_match">🔴 결과 매칭</option>
              </select>
            </div>
          </div>

          <div className="ha-form-group">
            <label>질문 내용 (메인 타이틀)</label>
            <textarea value={step.question} onChange={(e) => onUpdate(step.id, 'question', e.target.value)} rows={2} className="ha-textarea"/>
          </div>

          <div className="ha-form-group">
            <label>보조 텍스트 (글자 크기, 색상, 이미지, 스타일 설정 가능)</label>
            <div className="ha-quill-wrapper">
              <ReactQuill 
                theme="snow"
                value={step.subText || ''}
                onChange={(content) => onUpdate(step.id, 'subText', content)}
                modules={quillModules}
                placeholder="내용을 입력하세요..."
              />
            </div>
          </div>
          
          {step.type !== 'result_match' && (
            <div className="ha-form-group">
              <label>데이터 저장 키 (DB 필드명)</label>
              <input type="text" value={step.dataKey || ''} onChange={(e) => onUpdate(step.id, 'dataKey', e.target.value)} className="ha-input-text"/>
            </div>
          )}

          <div className="ha-divider"></div>

          {step.type === 'choice' && (
            <div className="ha-options-area">
              <label className="ha-sub-label">답변 버튼 설정</label>
              {step.options.map((opt, idx) => (
                <div key={opt.id} className="ha-option-item">
                  <div className="ha-drag-handle"><GripVertical size={14}/></div>
                  <div className="ha-opt-content">
                    <div className="ha-opt-row-top grid-layout">
                      <div className="grid-item label">
                        <input type="text" value={opt.label} onChange={(e) => onUpdateOption(step.id, idx, 'label', e.target.value)} placeholder="버튼명" className="ha-input-sm"/>
                      </div>
                      <div className="grid-item value">
                        <input type="text" value={opt.value || ''} onChange={(e) => onUpdateOption(step.id, idx, 'value', e.target.value)} placeholder="저장값" className="ha-input-sm"/>
                      </div>
                      <div className="grid-item icon">
                        <IconSelector value={opt.icon || ''} onChange={(val) => onUpdateOption(step.id, idx, 'icon', val)} />
                      </div>
                    </div>

                    <div className="ha-opt-row-bottom">
                      <span className="ha-arrow-icon">↳ 이동:</span>
                      <select value={opt.actionLink === null ? 'step' : 'link'} onChange={(e) => onTypeChange(step.id, idx, e.target.value as any)} className="ha-select-sm type-selector">
                        <option value="step">다음 질문</option>
                        <option value="link">링크 직접입력</option>
                      </select>
                      {opt.actionLink === null ? (
                        <select value={opt.nextStepId ?? ''} onChange={(e) => onUpdateOption(step.id, idx, 'nextStepId', e.target.value)} className="ha-select-sm target-selector">
                          <option value="">질문 선택...</option>
                          {sortedStepsList.map(s => (
                            <option key={s.id} value={s.id}>{s.adminTitle ? `[${s.adminTitle}]` : s.question.substring(0, 15)}</option>
                          ))}
                        </select>
                      ) : (
                        <input type="text" value={opt.actionLink ?? ''} onChange={(e) => onUpdateOption(step.id, idx, 'actionLink', e.target.value)} className="ha-input-sm target-input" placeholder="/url"/>
                      )}
                    </div>
                  </div>
                  <button onClick={() => onDeleteOption(step.id, idx)} className="ha-btn-icon-sm delete"><Trash size={14}/></button>
                </div>
              ))}
              <button className="ha-btn-add-option" onClick={() => onAddOption(step.id)}>+ 옵션 추가</button>
            </div>
          )}

          {step.type === 'region' && (
            <div className="ha-special-box region">
              <div className="ha-box-icon"><MapPin size={20}/></div>
              <div className="ha-box-content">
                <strong>지역 선택 모듈</strong>
                <p>전국 시/도 및 시/구/군 데이터가 자동으로 로드됩니다.</p>
                <div className="ha-field-row">
                  <label>다음 단계:</label>
                  <select value={step.nextStepId || ''} onChange={(e) => onUpdate(step.id, 'nextStepId', e.target.value)} className="ha-input-select">
                    <option value="">질문 선택...</option>
                    {sortedStepsList.map(s => (<option key={s.id} value={s.id}>{s.adminTitle || s.question.substring(0,10)}</option>))}
                  </select>
                </div>
              </div>
            </div>
          )}

          {step.type === 'auth_gate' && (
            <div className="ha-special-box auth">
              <div className="ha-box-icon"><Settings size={20}/></div>
              <div className="ha-box-content">
                <strong>로그인 게이트 설정</strong>
                <p>비회원에게 3가지 가입 옵션을 보여줍니다.</p>
                <div className="ha-stack">
                  <div className="ha-row-center">
                    <span className="ha-badge-social kakao">Kakao</span>
                    <input type="text" placeholder="/auth/kakao" value={step.kakaoUrl||''} onChange={e=>onUpdate(step.id,'kakaoUrl',e.target.value)} className="ha-input-text"/>
                  </div>
                  <div className="ha-row-center">
                    <span className="ha-badge-social naver">Naver</span>
                    <input type="text" placeholder="/auth/naver" value={step.naverUrl||''} onChange={e=>onUpdate(step.id,'naverUrl',e.target.value)} className="ha-input-text"/>
                  </div>
                  <div className="ha-row-center">
                    <span className="ha-badge-social email">Email</span>
                    <input type="text" placeholder="/signup" value={step.emailUrl||''} onChange={e=>onUpdate(step.id,'emailUrl',e.target.value)} className="ha-input-text"/>
                  </div>
                  <div className="ha-divider-dashed"></div>
                  <div className="ha-field-row">
                    <label>통과 후 이동:</label>
                    <select value={step.nextStepId || ''} onChange={(e) => onUpdate(step.id, 'nextStepId', e.target.value)} className="ha-input-select">
                        <option value="">질문 선택...</option>
                        {sortedStepsList.map(s => (<option key={s.id} value={s.id}>{s.adminTitle || s.question.substring(0,10)}</option>))}
                    </select>
                  </div>
                </div>
              </div>
            </div>
          )}

          {step.type === 'result_match' && (
             <div className="ha-special-box result">
               <div className="ha-box-icon"><CheckCircle size={20}/></div>
               <div className="ha-box-content"><strong>결과 매칭 화면</strong></div>
             </div>
          )}
        </div>
      )}
    </div>
  );
};

// --- [Main Page] ---
const HomeAdminPage: React.FC = () => {
  const db = getFirestore();
  const [steps, setSteps] = useState<Record<string, SurveyStep>>({});
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    const loadConfig = async () => {
      try {
        const snap = await getDoc(doc(db, 'system', 'home_survey_config'));
        if (snap.exists()) {
          const rawData = snap.data().data;
          Object.keys(rawData).forEach((key, idx) => {
            if (typeof rawData[key].order === 'undefined') rawData[key].order = idx;
          });
          setSteps(rawData);
        } else {
          setSteps({ start: { id: 'start', type: 'choice', question: '방문 목적', options: [], order: 0 } });
        }
      } catch (e) { console.error(e); } 
      finally { setLoading(false); }
    };
    loadConfig();
  }, []);

  const handleUpdateStep = (id: string, field: keyof SurveyStep, value: any) => setSteps(prev => ({ ...prev, [id]: { ...prev[id], [field]: value } }));
  const handleAddStep = () => {
    const newId = `step_${Date.now()}`;
    const maxOrder = Object.values(steps).length > 0 ? Math.max(...Object.values(steps).map(s => s.order || 0)) : 0;
    setSteps(prev => ({ ...prev, [newId]: { id: newId, type: 'choice', question: '', options: [], order: maxOrder + 1, adminTitle: '새 단계' } }));
  };
  const handleDeleteStep = (id: string) => { if(id==='start') return alert('삭제불가'); const n={...steps}; delete n[id]; setSteps(n); };
  
  const handleMoveStep = (id: string, direction: 'up' | 'down') => {
    const sorted = Object.values(steps).sort((a,b)=>(a.order||0)-(b.order||0));
    const idx = sorted.findIndex(s=>s.id===id);
    if(idx===-1) return;
    const targetIdx = direction==='up'?idx-1:idx+1;
    if(targetIdx<0 || targetIdx>=sorted.length) return;
    const current=sorted[idx], target=sorted[targetIdx];
    const n={...steps};
    n[current.id]={...current, order:target.order};
    n[target.id]={...target, order:current.order};
    setSteps(n);
  };

  const handleAddOption = (id: string) => setSteps(prev => ({...prev, [id]: {...prev[id], options: [...prev[id].options, {id:`opt_${Date.now()}`, label:'', icon:'', actionLink:''}]}}));
  const handleUpdateOption = (id: string, idx: number, f: keyof SurveyOption, v: any) => setSteps(prev => { const opts=[...prev[id].options]; opts[idx]={...opts[idx], [f]:v}; return {...prev, [id]: {...prev[id], options:opts}}; });
  const handleDeleteOption = (id: string, idx: number) => setSteps(prev => { const opts=prev[id].options.filter((_,i)=>i!==idx); return {...prev, [id]: {...prev[id], options:opts}}; });
  const handleTypeChange = (id: string, idx: number, t: 'link'|'step') => setSteps(prev => { const opts=[...prev[id].options]; if(t==='link') opts[idx]={...opts[idx], nextStepId:null, actionLink:''}; else opts[idx]={...opts[idx], actionLink:null, nextStepId:''}; return {...prev, [id]: {...prev[id], options:opts}}; });

  const handleSave = async () => {
    setIsSaving(true);
    try { await setDoc(doc(db, 'system', 'home_survey_config'), { data: JSON.parse(JSON.stringify(steps)) }); alert('저장 완료'); }
    catch (e) { alert('실패'); } finally { setIsSaving(false); }
  };

  if (loading) return <div className="ha-loading">Loading...</div>;
  const sortedSteps = Object.values(steps).sort((a, b) => (a.order || 0) - (b.order || 0));

  return (
    <div className="ha-container">
      <div className="ha-header-bar">
        <h2>메인 설문 시나리오 관리</h2>
        <button className="ha-btn-primary" onClick={handleSave} disabled={isSaving}><Save size={18}/> {isSaving?'저장 중...':'설정 저장'}</button>
      </div>
      <div className="ha-masonry-layout">
        {sortedSteps.map((step, index) => (
          <StepCard key={step.id} step={step} steps={steps} index={index} totalSteps={sortedSteps.length}
            onUpdate={handleUpdateStep} onDelete={handleDeleteStep}
            onAddOption={handleAddOption} onUpdateOption={handleUpdateOption} onDeleteOption={handleDeleteOption}
            onTypeChange={handleTypeChange} onMove={handleMoveStep}
          />
        ))}
        <button className="ha-card-add" onClick={handleAddStep}><Plus size={32}/><span>새 질문 추가</span></button>
      </div>
    </div>
  );
};

export default HomeAdminPage;