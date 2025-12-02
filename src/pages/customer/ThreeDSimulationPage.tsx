import React, { useState, useEffect, Suspense, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Canvas } from '@react-three/fiber';
import { 
    OrbitControls, Grid, ContactShadows, Environment, Sky, 
    TransformControls, Html, useCursor, Text 
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
type ItemType = 'floor' | 'wall' | 'window' | 'furniture' | 'text';

interface SceneItem {
  id: string;
  type: ItemType;
  subType?: string;
  name: string;
  position: [number, number, number];
  rotation: [number, number, number];
  scale: [number, number, number];
  size: [number, number, number]; 
  color: string;
  textData?: string;
}

// --- [치수 표시 컴포넌트 (왜곡 방지 적용)] ---
const ObjectDimensions = ({ scale, type }: { scale: [number, number, number], type: ItemType }) => {
    const [w, h, d] = scale; 
    const safeW = w || 0.001;
    const safeH = h || 0.001;
    const safeD = d || 0.001;

    const fontSize = 0.3; 
    const color = "black";
    const outlineColor = "white";
    const outlineWidth = 0.04;
    const offset = 0.2; // 물체 가장자리와의 거리

    // 1. 바닥 (Floor) - X축 -90도 회전 상태
    // 텍스트의 로컬 좌표계: X(가로), Y(세로-원래 Z), Z(높이-원래 -Y)
    if (type === 'floor') {
        // 바닥 텍스트가 부모의 스케일을 따라가지 않도록 역수 적용 (회전된 축 고려)
        const floorInvScale: [number, number, number] = [1/safeW, 1/safeD, 1/safeH];

        return (
            <group>
                 {/* 가로 길이 (위쪽 변) */}
                 <Text 
                    position={[0, (safeD/2 + offset)/safeD, 0.2/safeH]} // Z축(화면상 Y)으로 약간 띄움
                    rotation={[-Math.PI/2, 0, 0]}
                    scale={floorInvScale}
                    fontSize={fontSize} color={color} 
                    outlineColor={outlineColor} outlineWidth={outlineWidth}
                    anchorY="bottom"
                >
                    {w.toFixed(1)}m
                </Text>
                {/* 세로 길이 (오른쪽 변) */}
                <Text 
                    position={[(safeW/2 + offset)/safeW, 0, 0.2/safeH]} 
                    rotation={[-Math.PI/2, 0, -Math.PI/2]} 
                    scale={floorInvScale}
                    fontSize={fontSize} color={color} 
                    outlineColor={outlineColor} outlineWidth={outlineWidth}
                    anchorY="bottom"
                >
                    {d.toFixed(1)}m
                </Text>
            </group>
        );
    }

    // 2. 벽/가구 (Wall/Furniture) - 기본 회전 없음
    // 텍스트 로컬 좌표계: X(가로), Y(세로), Z(깊이)
    const stdInvScale: [number, number, number] = [1/safeW, 1/safeH, 1/safeD];

    return (
        <group>
            {/* 가로 (상단) */}
            <Text 
                position={[0, (safeH/2 + offset)/safeH, 0]} 
                scale={stdInvScale}
                fontSize={fontSize} color={color} outlineColor={outlineColor} outlineWidth={outlineWidth}
                anchorY="bottom"
            >
                W: {w.toFixed(1)}m
            </Text>
            
            {/* 높이 (우측) */}
            <Text 
                position={[(safeW/2 + offset)/safeW, 0, 0]} 
                scale={stdInvScale}
                fontSize={fontSize} color={color} outlineColor={outlineColor} outlineWidth={outlineWidth}
                anchorX="left"
            >
                H: {h.toFixed(1)}m
            </Text>
            
            {/* 깊이 (하단 - 바닥에 눕혀서 표시) */}
            {type !== 'window' && (
                <Text 
                    position={[0, -(safeH/2)/safeH, (safeD/2 + 0.2)/safeD]} 
                    rotation={[-Math.PI/2, 0, 0]}
                    scale={stdInvScale}
                    fontSize={fontSize * 0.8} color={color} outlineColor={outlineColor} outlineWidth={outlineWidth}
                    anchorY="top"
                >
                    D: {d.toFixed(1)}m
                </Text>
            )}
        </group>
    );
};

// --- [3D 객체 컴포넌트] ---
const DraggableItem = ({ 
    item, isSelected, onSelect, onTransform, controlMode, showWallDims, showFloorDims 
}: { 
    item: SceneItem, 
    isSelected: boolean, 
    onSelect: () => void, 
    onTransform: (newProps: any) => void,
    controlMode: 'translate' | 'rotate' | 'scale',
    showWallDims: boolean,
    showFloorDims: boolean
}) => {
    const [sceneObject, setSceneObject] = useState<THREE.Group | null>(null);
    const [hovered, setHover] = useState(false);
    useCursor(hovered);

    const shouldShowDim = isSelected || (item.type === 'wall' && showWallDims) || (item.type === 'floor' && showFloorDims);

    // 타입별 형상 및 재질
    let geometry;
    let materialProps: any = { color: item.color };

    if (item.type === 'floor') {
        geometry = <boxGeometry args={[1, 0.05, 1]} />; 
        materialProps = { color: item.color, roughness: 0.8 };
    } else if (item.type === 'window') {
        geometry = <boxGeometry args={[1, 1, 0.2]} />;
        materialProps = { 
            color: '#aaddff', transparent: true, opacity: 0.5, roughness: 0, metalness: 0.2 
        };
    } else {
        geometry = <boxGeometry args={[1, 1, 1]} />;
        materialProps = { color: item.color };
    }

    const handleTransformEnd = () => {
        if (sceneObject) {
            const o = sceneObject;
            onTransform({
                position: [o.position.x, o.position.y, o.position.z],
                rotation: [o.rotation.x, o.rotation.y, o.rotation.z],
                scale: [o.scale.x, o.scale.y, o.scale.z]
            });
        }
    };

    // 텍스트 객체 처리
    if (item.type === 'text') {
        return (
            <>
                {isSelected && sceneObject && (
                    <TransformControls object={sceneObject} mode={controlMode} onMouseUp={handleTransformEnd} translationSnap={0.1} />
                )}
                <group 
                    ref={setSceneObject}
                    position={item.position} rotation={new THREE.Euler(...item.rotation)} scale={item.scale}
                    onClick={(e) => { e.stopPropagation(); onSelect(); }}
                    onPointerOver={() => setHover(true)} onPointerOut={() => setHover(false)}
                >
                    <Text color={item.color} fontSize={0.5} anchorX="center" anchorY="middle" outlineWidth={0.02} outlineColor="white">
                        {item.textData || "텍스트"}
                    </Text>
                    <mesh visible={false}><planeGeometry args={[item.name.length * 0.5, 0.5]} /></mesh>
                </group>
            </>
        );
    }

    return (
        <>
            {/* 컨트롤러 */}
            {isSelected && sceneObject && (
                <TransformControls 
                    object={sceneObject}
                    mode={controlMode}
                    translationSnap={0.1}
                    rotationSnap={Math.PI / 24}
                    onMouseUp={handleTransformEnd} 
                />
            )}

            <group 
                ref={setSceneObject} 
                position={item.position} 
                rotation={new THREE.Euler(...item.rotation)} 
                scale={item.scale}
                onClick={(e) => { 
                    e.stopPropagation(); 
                    onSelect(); 
                }}
                onPointerOver={() => setHover(true)}
                onPointerOut={() => setHover(false)}
            >
                <mesh castShadow={item.type !== 'window'} receiveShadow>
                    {geometry}
                    <meshStandardMaterial {...materialProps} />
                </mesh>

                {/* 라벨 */}
                {['furniture'].includes(item.type) && (isSelected || hovered) && (
                    <Html position={[0, 0.8, 0]} center distanceFactor={10} style={{pointerEvents:'none'}}>
                        <div className={`item-label ${isSelected ? 'selected' : ''}`}>{item.name}</div>
                    </Html>
                )}

                {/* 치수 표시 */}
                {shouldShowDim && (
                    <ObjectDimensions scale={item.scale} type={item.type} />
                )}
            </group>
        </>
    );
};

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

  const [showWallDims, setShowWallDims] = useState(true);
  const [showFloorDims, setShowFloorDims] = useState(true); 
  
  const [newText, setNewText] = useState('Hello');
  const [textColor, setTextColor] = useState('#000000');

  useEffect(() => {
    if (!isMenuLoading && mainMenus.length > 0) {
        const hasLounge = mainMenus.find(m => m.key === 'lounge');
        if (hasLounge) setSelectedMenu('lounge');
    }
  }, [isMenuLoading, mainMenus]);

  useEffect(() => {
      const handleResize = () => setIsMobile(window.innerWidth < 768);
      window.addEventListener('resize', handleResize);
      
      setItems(prev => {
          if (prev.length === 0) {
             const floorId = Date.now().toString();
             return [{
                id: floorId, type: 'floor', subType: 'default', name: '기본 바닥',
                position: [0, -0.025, 0], rotation: [0,0,0], scale: [5, 1, 5], size: [1,1,1], color: '#eeeeee'
             }];
          }
          return prev;
      });
      
      return () => window.removeEventListener('resize', handleResize);
  }, []);

  const addItem = (type: ItemType, subType: string = 'default') => {
      const id = Date.now().toString();
      let newItem: SceneItem = {
          id, type, subType, name: '', 
          position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1], size: [1, 1, 1], color: '#ffffff'
      };

      if (type === 'floor') {
          newItem = { ...newItem, name: '추가 바닥', position: [2, -0.02, 2], scale: [3, 1, 3], color: '#e0e0e0' };
      } else if (type === 'wall') {
          newItem = { ...newItem, name: '벽', position: [0, 1.2, 0], scale: [3, 2.4, 0.2], color: '#cfd8dc' };
      } else if (type === 'window') {
          newItem = { ...newItem, name: '창문', position: [0, 1.5, 0], scale: [1.2, 1.2, 0.3], color: '#aaddff' };
      } else if (type === 'text') {
          newItem = { ...newItem, name: '텍스트', textData: newText, position: [0, 1.5, 0], scale: [1, 1, 1], color: textColor };
      } else if (type === 'furniture') {
          switch(subType) {
              case 'bed': newItem = { ...newItem, name: '침대', position:[0, 0.25, 0], scale:[1.6, 0.5, 2.0], color:'#5c6bc0' }; break;
              case 'sofa': newItem = { ...newItem, name: '소파', position:[0, 0.4, 0], scale:[2.0, 0.8, 0.8], color:'#8d6e63' }; break;
              case 'table': newItem = { ...newItem, name: '식탁', position:[0, 0.4, 0], scale:[1.4, 0.8, 0.8], color:'#ffcc80' }; break;
              case 'wardrobe': newItem = { ...newItem, name: '옷장', position:[0, 1.0, 0], scale:[1.0, 2.0, 0.6], color:'#81c784' }; break;
          }
      }
      setItems(prev => [...prev, newItem]);
      setSelectedId(id);
      setControlMode('translate'); 
  };

  const handleTransform = (newProps: any) => {
      if (!selectedId) return;
      setItems(prev => prev.map(item => item.id === selectedId ? { ...item, ...newProps } : item));
  };

  const updateSelectedItem = (key: string, value: any) => {
      if(!selectedId) return;
      setItems(prev => prev.map(item => {
          if(item.id !== selectedId) return item;
          if (key === 'color') return { ...item, color: value };
          if (key === 'textData') return { ...item, textData: value };
          if (['sx','sy','sz'].includes(key)) {
              const newScale = [...item.scale] as [number, number, number];
              if(key==='sx') newScale[0] = value;
              if(key==='sy') newScale[1] = value;
              if(key==='sz') newScale[2] = value;
              return { ...item, scale: newScale };
          }
          if (key === 'rotY') {
              return { ...item, rotation: [item.rotation[0], value * (Math.PI/180), item.rotation[2]] };
          }
          return item;
      }));
  };

  const deleteSelected = () => {
      if(!selectedId) return;
      if(window.confirm("선택한 항목을 삭제하시겠습니까?")) {
          setItems(prev => prev.filter(f => f.id !== selectedId));
          setSelectedId(null);
      }
  };

  const handleModeChange = (mode: 'translate' | 'rotate' | 'scale') => {
      setControlMode(mode);
  };

  const handleScreenshot = () => {
      const canvas = document.querySelector('canvas');
      if (canvas) {
          const link = document.createElement('a');
          link.download = 'my-interior-design.png';
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
                <p>바닥과 벽을 세우고 가구를 배치하여 나만의 공간을 만들어보세요.</p>
            </div>

            <div className="td-editor-wrapper">
                <div className="td-sidebar left">
                    <div className="td-panel-section">
                        <h4>🏗️ 구조물 (방 만들기)</h4>
                        <div className="td-btn-grid col-2">
                            <button onClick={() => addItem('floor')}>🟫 바닥 추가</button>
                            <button onClick={() => addItem('wall')}>🧱 벽 세우기</button>
                            <button onClick={() => addItem('window')}>🪟 창문</button>
                        </div>
                    </div>
                    <div className="td-panel-section">
                        <h4>🪑 가구 배치</h4>
                        <div className="td-btn-grid col-2">
                            <button onClick={() => addItem('furniture', 'bed')}>🛏️ 침대</button>
                            <button onClick={() => addItem('furniture', 'sofa')}>🛋️ 소파</button>
                            <button onClick={() => addItem('furniture', 'table')}>🍽️ 식탁</button>
                            <button onClick={() => addItem('furniture', 'wardrobe')}>🚪 옷장</button>
                        </div>
                    </div>
                    <div className="td-footer-btn"><button onClick={handleScreenshot}>📷 화면 캡처</button></div>
                </div>

                <div className="td-canvas-area">
                    <Canvas 
                        shadows 
                        camera={{ position: [8, 12, 12], fov: 45 }} 
                        gl={{ preserveDrawingBuffer: true }}
                        onPointerMissed={(e) => { if (e.type === 'click') setSelectedId(null); }}
                    >
                        <color attach="background" args={['#f5f7fa']} />
                        <Sky sunPosition={[100, 20, 100]} />
                        <ambientLight intensity={0.5} />
                        <directionalLight position={[10, 20, 5]} intensity={1} castShadow shadow-mapSize={[1024, 1024]} />
                        <Environment preset="city" />
                        <Suspense fallback={null}>
                            <group>
                                <Grid position={[0, -0.05, 0]} args={[30, 30]} cellSize={1} sectionSize={1} sectionColor="#ddd" cellColor="#eee" fadeDistance={50} />
                                
                                {items.map(item => (
                                    <DraggableItem 
                                        key={item.id} 
                                        item={item} 
                                        isSelected={selectedId === item.id} 
                                        controlMode={controlMode}
                                        onSelect={() => setSelectedId(item.id)}
                                        onTransform={handleTransform}
                                        showWallDims={showWallDims}
                                        showFloorDims={showFloorDims}
                                    />
                                ))}
                                <ContactShadows position={[0, -0.04, 0]} opacity={0.4} scale={50} blur={2} far={4} />
                            </group>
                        </Suspense>
                        <OrbitControls makeDefault minPolarAngle={0} maxPolarAngle={Math.PI / 2.1} />
                    </Canvas>
                </div>

                <div className="td-sidebar right">
                    <div className="td-panel-section">
                        <h4>🛠️ 조작 모드</h4>
                        <div className="td-tools-row">
                            <button onClick={() => handleModeChange('translate')} className={controlMode === 'translate' ? 'active' : ''}>이동</button>
                            <button onClick={() => handleModeChange('rotate')} className={controlMode === 'rotate' ? 'active' : ''}>회전</button>
                            <button onClick={() => handleModeChange('scale')} className={controlMode === 'scale' ? 'active' : ''}>크기</button>
                        </div>
                    </div>

                    <div className="td-panel-section">
                        <h4>👁️ 보기 설정</h4>
                        <div className="td-chk-row"><label><input type="checkbox" checked={showWallDims} onChange={e => setShowWallDims(e.target.checked)} /> 벽체 사이즈 표시</label></div>
                        <div className="td-chk-row"><label><input type="checkbox" checked={showFloorDims} onChange={e => setShowFloorDims(e.target.checked)} /> 바닥 사이즈 표시</label></div>
                    </div>

                    <div className="td-panel-section">
                        <h4>🔤 텍스트 넣기</h4>
                        <div className="td-text-input-row">
                            <input type="text" value={newText} onChange={e => setNewText(e.target.value)} placeholder="내용 입력" />
                            <input type="color" value={textColor} onChange={e => setTextColor(e.target.value)} style={{width:'30px', padding:0, border:'none'}} />
                        </div>
                        <button className="td-btn-add" onClick={() => addItem('text')}>글자 추가</button>
                    </div>

                    {selectedItem ? (
                        <div className="td-panel-section highlight">
                            <h4>⚙️ 속성 편집</h4>
                            <div className="td-item-name-tag">{selectedItem.name}</div>
                            {selectedItem.type === 'text' && (<div className="td-control-row"><label>내용</label><input type="text" value={selectedItem.textData || ''} onChange={e => updateSelectedItem('textData', e.target.value)} /></div>)}
                            <div className="td-control-row"><label>가로(W)</label><input type="number" step="0.1" value={selectedItem.scale[0].toFixed(2)} onChange={e => updateSelectedItem('sx', Number(e.target.value))} /></div>
                            <div className="td-control-row"><label>높이(H)</label><input type="number" step="0.1" value={selectedItem.scale[1].toFixed(2)} onChange={e => updateSelectedItem('sy', Number(e.target.value))} /></div>
                            <div className="td-control-row"><label>깊이(D)</label><input type="number" step="0.1" value={selectedItem.scale[2].toFixed(2)} onChange={e => updateSelectedItem('sz', Number(e.target.value))} /></div>
                            <div className="td-control-row"><label>회전(°)</label><input type="range" min="0" max="360" step="15" value={(selectedItem.rotation[1] * 180 / Math.PI).toFixed(0)} onChange={e => updateSelectedItem('rotY', Number(e.target.value))} /></div>
                            <div className="td-control-row"><label>색상</label><input type="color" value={selectedItem.color} onChange={e => updateSelectedItem('color', e.target.value)} /></div>
                            <button className="td-btn-delete" onClick={deleteSelected}>🗑️ 삭제</button>
                        </div>
                    ) : (
                        <div className="td-empty-msg">물체를 선택하면<br/>속성을 수정할 수 있습니다.</div>
                    )}
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