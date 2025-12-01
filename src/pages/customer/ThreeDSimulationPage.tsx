import React, { useState, useEffect, Suspense, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Canvas } from '@react-three/fiber';
import { 
    OrbitControls, Grid, ContactShadows, Environment, Sky, 
    TransformControls, Html, useCursor 
} from '@react-three/drei';
import * as THREE from 'three';

// 공통 컴포넌트
import Header from '../../components/common/Header';
import SubNav from '../../components/common/SubNav';
import MobileMenu from '../../components/common/MobileMenu'; 
import Footer from '../../components/common/Footer';
import RoleHeader from '../../components/common/RoleHeader';
import { useMenu } from '../../contexts/MenuContext';

import './ThreeDSimulationPage.css'; 

// --- [타입 정의] ---
type ItemType = 'floor' | 'wall' | 'window' | 'furniture';

interface SceneItem {
  id: string;
  type: ItemType;
  subType?: string; // 가구 종류 등
  name: string;
  position: [number, number, number];
  rotation: [number, number, number];
  scale: [number, number, number];
  size: [number, number, number]; // 기본 형상 크기
  color: string;
}

// --- [3D 객체 컴포넌트] ---
const DraggableItem = ({ 
    item, isSelected, onSelect, onTransform 
}: { 
    item: SceneItem, isSelected: boolean, onSelect: () => void, onTransform: (newProps: any) => void 
}) => {
    const [hovered, setHover] = useState(false);
    useCursor(hovered);

    // 타입별 지오메트리 및 재질 설정
    let geometry;
    let materialProps: any = { color: item.color };

    if (item.type === 'floor') {
        // 바닥은 얇은 박스로 처리 (그림자 받기 용이)
        geometry = <boxGeometry args={[1, 0.05, 1]} />; 
        materialProps = { color: item.color, roughness: 0.8 };
    } else if (item.type === 'window') {
        // 창문은 투명하게
        geometry = <boxGeometry args={[1, 1, 1]} />;
        materialProps = { 
            color: '#aaddff', 
            transparent: true, 
            opacity: 0.4, 
            roughness: 0, 
            metalness: 0.1 
        };
    } else {
        // 벽, 가구
        geometry = <boxGeometry args={[1, 1, 1]} />;
        materialProps = { color: item.color };
    }

    return (
        <>
            {isSelected && (
                <TransformControls 
                    object={undefined}
                    position={item.position} 
                    rotation={new THREE.Euler(...item.rotation)}
                    scale={item.scale}
                    onObjectChange={(e: any) => {
                        if (e?.target?.object) {
                            const o = e.target.object;
                            onTransform({
                                position: [o.position.x, o.position.y, o.position.z],
                                rotation: [o.rotation.x, o.rotation.y, o.rotation.z],
                                scale: [o.scale.x, o.scale.y, o.scale.z]
                            });
                        }
                    }}
                    mode={window.currentMode || "translate"} // 전역 변수 해킹 대신 props로 내리는게 정석이나 편의상
                    translationSnap={0.25}
                    rotationSnap={Math.PI / 12} // 15도
                />
            )}

            <group 
                position={item.position} 
                rotation={new THREE.Euler(...item.rotation)} 
                scale={item.scale}
                onClick={(e) => { e.stopPropagation(); onSelect(); }}
                onPointerOver={() => setHover(true)}
                onPointerOut={() => setHover(false)}
            >
                <mesh castShadow={item.type !== 'window'} receiveShadow>
                    {geometry}
                    <meshStandardMaterial {...materialProps} />
                </mesh>

                {/* 라벨 (선택 시에만, 혹은 바닥엔 안보이게) */}
                {item.type !== 'floor' && item.type !== 'wall' && (
                    <Html position={[0, 0.6, 0]} center distanceFactor={8} style={{pointerEvents:'none'}}>
                        <div className={`item-label ${isSelected ? 'selected' : ''}`}>
                            {item.name}
                        </div>
                    </Html>
                )}
            </group>
        </>
    );
};

// 전역 변수 선언 (TransformControls 모드 제어용)
declare global { interface Window { currentMode: 'translate' | 'rotate' | 'scale'; } }

const ThreeDSimulationPage: React.FC = () => {
  const navigate = useNavigate();
  const { mainMenus, isLoading: isMenuLoading } = useMenu();
  const [selectedMenu, setSelectedMenu] = useState('lounge');
  
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768); 

  // --- [Editor State] ---
  const [items, setItems] = useState<SceneItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [controlMode, setControlMode] = useState<'translate' | 'rotate' | 'scale'>('translate');

  // 초기 모드 설정
  window.currentMode = controlMode;

  useEffect(() => {
    if (!isMenuLoading && mainMenus.length > 0) {
        const hasLounge = mainMenus.find(m => m.key === 'lounge');
        if (hasLounge) setSelectedMenu('lounge');
    }
  }, [isMenuLoading, mainMenus]);

  useEffect(() => {
      const handleResize = () => setIsMobile(window.innerWidth < 768);
      window.addEventListener('resize', handleResize);
      // [초기 바닥 하나 생성]
      addItem('floor');
      return () => window.removeEventListener('resize', handleResize);
  }, []);

  // --- [Actions] ---

  const addItem = (type: ItemType, subType: string = 'default') => {
      const id = Date.now().toString();
      let newItem: SceneItem = {
          id, type, subType, name: '', 
          position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1], size: [1, 1, 1], color: '#ffffff'
      };

      if (type === 'floor') {
          newItem = { ...newItem, name: '바닥', position: [0, -0.025, 0], scale: [5, 1, 5], color: '#eeeeee' };
      } else if (type === 'wall') {
          newItem = { ...newItem, name: '벽', position: [0, 1.2, -2.5], scale: [5, 2.4, 0.2], color: '#e0e0e0' };
      } else if (type === 'window') {
          newItem = { ...newItem, name: '창문', position: [0, 1.5, -2.5], scale: [1.5, 1.0, 0.3], color: '#aaddff' };
      } else if (type === 'furniture') {
          // 가구 프리셋
          switch(subType) {
              case 'bed': newItem = { ...newItem, name: '침대', position:[0, 0.25, 0], scale:[1.6, 0.5, 2.0], color:'#5c6bc0' }; break;
              case 'sofa': newItem = { ...newItem, name: '소파', position:[0, 0.4, 0], scale:[2.0, 0.8, 0.8], color:'#8d6e63' }; break;
              case 'table': newItem = { ...newItem, name: '테이블', position:[0, 0.4, 0], scale:[1.4, 0.8, 0.8], color:'#ffcc80' }; break;
              case 'wardrobe': newItem = { ...newItem, name: '옷장', position:[0, 1.0, 0], scale:[1.0, 2.0, 0.6], color:'#81c784' }; break;
          }
      }

      setItems(prev => [...prev, newItem]);
      setSelectedId(id);
      setControlMode('translate'); // 추가 직후엔 이동 모드
  };

  const handleTransform = (id: string, newProps: any) => {
      setItems(prev => prev.map(item => item.id === id ? { ...item, ...newProps } : item));
  };

  const updateSelectedItem = (key: string, value: any) => {
      if(!selectedId) return;
      setItems(prev => prev.map(item => {
          if(item.id !== selectedId) return item;
          
          if (key === 'color') return { ...item, color: value };
          
          // Scale 개별 조정 (UI 입력용)
          if (['sx','sy','sz'].includes(key)) {
              const newScale = [...item.scale] as [number, number, number];
              if(key==='sx') newScale[0] = value;
              if(key==='sy') newScale[1] = value;
              if(key==='sz') newScale[2] = value;
              return { ...item, scale: newScale };
          }
          // Rotation Y 조정
          if (key === 'rotY') {
              return { ...item, rotation: [item.rotation[0], value * (Math.PI/180), item.rotation[2]] };
          }

          return item;
      }));
  };

  const deleteSelected = () => {
      if(!selectedId) return;
      setItems(prev => prev.filter(f => f.id !== selectedId));
      setSelectedId(null);
  };

  const handleModeChange = (mode: 'translate' | 'rotate' | 'scale') => {
      setControlMode(mode);
      window.currentMode = mode;
  };

  const handleScreenshot = () => {
      const canvas = document.querySelector('canvas');
      if (canvas) {
          const link = document.createElement('a');
          link.download = 'my-design.png';
          link.href = canvas.toDataURL('image/png');
          link.click();
      }
  };

  const selectedItem = items.find(f => f.id === selectedId);

  return (
    <div className="page-container">
      {!isMobile && <RoleHeader />}
      <Header onMenuSelected={(k) => setSelectedMenu(k)} isMobile={isMobile} onHamburgerPressed={() => setIsMobileMenuOpen(true)} />
      {!isMobile && selectedMenu && <SubNav selectedMenuKey={selectedMenu} />}

      <main className="td-main">
        <div className="td-container">
            <div className="td-header">
                <h2>3D 셀프 인테리어</h2>
                <p>바닥을 깔고, 벽을 세우고, 가구를 배치해보세요.</p>
            </div>

            <div className="td-editor-wrapper">
                
                {/* [좌측] 도구 패널 */}
                <div className="td-sidebar">
                    
                    {/* 1. 기본 구조물 */}
                    <div className="td-panel-section">
                        <h4>🏗️ 구조물 추가</h4>
                        <div className="td-btn-grid col-2">
                            <button onClick={() => addItem('floor')}>🟫 바닥추가</button>
                            <button onClick={() => addItem('wall')}>🧱 벽 세우기</button>
                            <button onClick={() => addItem('window')}>🪟 창문 뚫기</button>
                        </div>
                        <p className="td-tip">* 바닥을 추가하여 방을 구분하세요.<br/>* 창문은 벽 위에 겹쳐 놓으세요.</p>
                    </div>

                    {/* 2. 가구 */}
                    <div className="td-panel-section">
                        <h4>🪑 가구 배치</h4>
                        <div className="td-btn-grid col-2">
                            <button onClick={() => addItem('furniture', 'bed')}>🛏️ 침대</button>
                            <button onClick={() => addItem('furniture', 'sofa')}>🛋️ 소파</button>
                            <button onClick={() => addItem('furniture', 'table')}>🍽️ 식탁</button>
                            <button onClick={() => addItem('furniture', 'wardrobe')}>🚪 옷장</button>
                        </div>
                    </div>

                    {/* 3. 조작 도구 */}
                    <div className="td-panel-section">
                        <h4>🛠️ 조작 모드</h4>
                        <div className="td-tools-row">
                            <button onClick={() => handleModeChange('translate')} className={controlMode === 'translate' ? 'active' : ''}>이동</button>
                            <button onClick={() => handleModeChange('rotate')} className={controlMode === 'rotate' ? 'active' : ''}>회전</button>
                            <button onClick={() => handleModeChange('scale')} className={controlMode === 'scale' ? 'active' : ''}>크기</button>
                        </div>
                    </div>

                    {/* 4. 속성 편집 (선택 시) */}
                    {selectedItem ? (
                        <div className="td-panel-section highlight">
                            <h4>⚙️ 속성 편집: {selectedItem.name}</h4>
                            
                            <div className="td-control-row">
                                <label>가로 크기</label>
                                <input type="number" step="0.1" value={selectedItem.scale[0].toFixed(2)} onChange={e => updateSelectedItem('sx', Number(e.target.value))} />
                            </div>
                            <div className="td-control-row">
                                <label>높이</label>
                                <input type="number" step="0.1" value={selectedItem.scale[1].toFixed(2)} onChange={e => updateSelectedItem('sy', Number(e.target.value))} />
                            </div>
                            <div className="td-control-row">
                                <label>세로(깊이)</label>
                                <input type="number" step="0.1" value={selectedItem.scale[2].toFixed(2)} onChange={e => updateSelectedItem('sz', Number(e.target.value))} />
                            </div>
                            <div className="td-control-row">
                                <label>회전 (각도)</label>
                                <input type="range" min="0" max="360" step="15" value={(selectedItem.rotation[1] * 180 / Math.PI).toFixed(0)} onChange={e => updateSelectedItem('rotY', Number(e.target.value))} />
                            </div>
                            <div className="td-control-row">
                                <label>색상</label>
                                <input type="color" value={selectedItem.color} onChange={e => updateSelectedItem('color', e.target.value)} />
                            </div>

                            <button className="td-btn-delete" onClick={deleteSelected}>🗑️ 삭제하기</button>
                        </div>
                    ) : (
                        <div className="td-empty-msg">물체를 클릭하여 선택하세요</div>
                    )}

                    <div className="td-footer-btn">
                        <button onClick={handleScreenshot}>📷 화면 캡처</button>
                    </div>
                </div>

                {/* [우측] 3D 캔버스 */}
                <div className="td-canvas-area" onClick={() => setSelectedId(null)}>
                    <Canvas shadows camera={{ position: [8, 10, 10], fov: 45 }} gl={{ preserveDrawingBuffer: true }}>
                        <color attach="background" args={['#f5f7fa']} />
                        <Sky sunPosition={[100, 20, 100]} />
                        <ambientLight intensity={0.5} />
                        <directionalLight position={[10, 20, 5]} intensity={1} castShadow shadow-mapSize={[1024, 1024]} />
                        <Environment preset="city" />
                        
                        <Suspense fallback={null}>
                            <group>
                                {/* 그리드 (무한 바닥 느낌) */}
                                <Grid position={[0, -0.03, 0]} args={[20, 20]} cellSize={1} sectionSize={1} sectionColor="#1976d2" cellColor="#e0e0e0" fadeDistance={40} />
                                
                                {/* 아이템 렌더링 */}
                                {items.map(item => (
                                    <DraggableItem 
                                        key={item.id} 
                                        item={item} 
                                        isSelected={selectedId === item.id} 
                                        onSelect={() => setSelectedId(item.id)}
                                        onTransform={(newProps) => handleTransform(item.id, newProps)}
                                    />
                                ))}

                                <ContactShadows position={[0, -0.02, 0]} opacity={0.4} scale={40} blur={2} far={4} />
                            </group>
                        </Suspense>

                        <OrbitControls makeDefault minPolarAngle={0} maxPolarAngle={Math.PI / 2.1} />
                    </Canvas>
                </div>

            </div>
        </div>
      </main>

      <Footer /> 
      {isMobileMenuOpen && isMobile && <MobileMenu onClose={() => setIsMobileMenuOpen(false)} />}
    </div>
  );
};

export default ThreeDSimulationPage;