import React, { useState, useEffect, Suspense, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Canvas, useThree } from '@react-three/fiber';
import { 
    OrbitControls, Grid, ContactShadows, Environment, Sky, 
    TransformControls, Line 
} from '@react-three/drei';
import * as THREE from 'three';

// 필요한 아이콘 및 컴포넌트
import MobileMenu from '../../components/common/MobileMenu';
import { useMenu } from '../../contexts/MenuContext';

// 마이프로젝트 페이지와 동일한 스타일 사용 (CSS 클래스명 mp-header 등 활용)
import './ThreeDSimulationPage.css'; 

// --- [SVG Icons] ---
const Icons = {
    Select: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 3l7.07 16.97 2.51-7.39 7.39-2.51L3 3z"/></svg>,
    Line: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="4" y1="20" x2="20" y2="4"/><circle cx="4" cy="20" r="2"/><circle cx="20" cy="4" r="2"/></svg>,
    Rect: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2" /></svg>,
    Circle: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="9" /></svg>,
    PushPull: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 3v12"/><path d="M8 7l4-4 4 4"/><path d="M4 15h16v6H4z"/></svg>,
    Eraser: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 2l4 4-10 10H7v-5L18 2z"/><path d="M3 22h18"/></svg>,
    Paint: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2L2 12l10 10 10-10L12 2zm0 4v12"/></svg>,
    Tape: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M2 12h20"/><path d="M2 8v8"/><path d="M22 8v8"/></svg>,
    Rotate: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>,
    Group: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/></svg>,
    FullScreen: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/></svg>,
    ExitFull: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M8 3v3H5m11 0h3V3m0 18v-3h3M5 21v-3h3"/></svg>
};

type ToolType = 'select' | 'line' | 'rect' | 'circle' | 'pushpull' | 'eraser' | 'paint' | 'tape' | 'rotate' | 'group';

interface SceneItem {
    id: string;
    type: 'face' | 'edge' | 'group' | 'guide';
    name?: string;
    geometryType?: 'plane' | 'box' | 'cylinder'; 
    points?: THREE.Vector3[]; 
    position?: [number, number, number];
    rotation?: [number, number, number];
    scale?: [number, number, number];
    color: string;
    selected?: boolean;
    edgeIds?: string[]; 
    faceIds?: string[]; 
    groupIds?: string[]; 
    parentId?: string | null;
}

// 1. VCB Component
const ValueControlBox = ({ value, label }: { value: string, label: string }) => (
    <div className={`td-vcb ${value ? 'active' : ''}`}>
        <div className="td-vcb-label">{label}</div>
        <div className="td-vcb-input">{value}</div>
    </div>
);

// 2. Toolbar Component
const Toolbar = ({ activeTool, setTool, onGroup }: { activeTool: ToolType, setTool: (t: ToolType) => void, onGroup: ()=>void }) => (
    <div className="td-toolbar-pc">
        <div className="td-tool-section">
            <button className={activeTool==='select'?'active':''} onClick={()=>setTool('select')} title="선택 (Space)"><Icons.Select/></button>
            <button className={activeTool==='eraser'?'active':''} onClick={()=>setTool('eraser')} title="지우개 (E)"><Icons.Eraser/></button>
            <button className={activeTool==='paint'?'active':''} onClick={()=>setTool('paint')} title="페인트 (B)"><Icons.Paint/></button>
        </div>
        <div className="td-divider-h" />
        <div className="td-tool-section">
            <button className={activeTool==='line'?'active':''} onClick={()=>setTool('line')} title="선 (L)"><Icons.Line/></button>
            <button className={activeTool==='rect'?'active':''} onClick={()=>setTool('rect')} title="직사각형 (R)"><Icons.Rect/></button>
            <button className={activeTool==='circle'?'active':''} onClick={()=>setTool('circle')} title="원 (C)"><Icons.Circle/></button>
        </div>
        <div className="td-divider-h" />
        <div className="td-tool-section">
            <button className={activeTool==='pushpull'?'active':''} onClick={()=>setTool('pushpull')} title="밀기/끌기 (P)"><Icons.PushPull/></button>
            <button className={activeTool==='rotate'?'active':''} onClick={()=>setTool('rotate')} title="회전 (Q)"><Icons.Rotate/></button>
            <button onClick={onGroup} title="그룹 만들기 (G)"><Icons.Group/></button>
        </div>
    </div>
);

// 3. Scene Controller
const SceneController = ({ 
    tool, items, setItems, vcbInput, setVcbValue, setVcbLabel, onCommit, isFullScreen
}: { 
    tool: ToolType, items: SceneItem[], setItems: React.Dispatch<React.SetStateAction<SceneItem[]>>,
    vcbInput: string, setVcbValue: (v: string) => void, setVcbLabel: (l: string) => void, onCommit: boolean,
    isFullScreen: boolean 
}) => {
    const { camera, raycaster, pointer, gl, scene } = useThree();
    const [drawingState, setDrawingState] = useState<'idle' | 'drawing' | 'pushing'>('idle');
    const [startPoint, setStartPoint] = useState<THREE.Vector3 | null>(null);
    const [tempPoints, setTempPoints] = useState<THREE.Vector3[] | null>(null);
    const [pushTarget, setPushTarget] = useState<SceneItem | null>(null);
    const [hoveredId, setHoveredId] = useState<string | null>(null);

    const planeIntersect = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

    useEffect(() => {
        const canvas = gl.domElement;
        if (tool === 'select') canvas.style.cursor = 'default';
        else if (tool === 'pushpull') canvas.style.cursor = hoveredId ? 'ns-resize' : 'default';
        else if (tool === 'rotate') canvas.style.cursor = 'alias';
        else if (tool === 'eraser') canvas.style.cursor = 'not-allowed';
        else canvas.style.cursor = 'crosshair';
    }, [tool, hoveredId, gl]);

    useEffect(() => {
        const labels: Record<string, string> = {
            select: '선택', rect: '치수 (가로, 세로)', circle: '반경', 
            pushpull: '거리 (+/-)', eraser: '삭제', line: '길이', 
            paint: '색상', rotate: '각도', group: '그룹'
        };
        setVcbLabel(labels[tool] || '');
    }, [tool, setVcbLabel]);

    const getSnapPoint = useCallback((targetPlane: THREE.Plane = planeIntersect) => {
        raycaster.setFromCamera(pointer, camera);
        const target = new THREE.Vector3();
        raycaster.ray.intersectPlane(targetPlane, target);
        if (target) {
            target.x = Math.round(target.x * 10) / 10;
            target.z = Math.round(target.z * 10) / 10;
            if(Math.abs(targetPlane.normal.y) > 0.9) target.y = Math.round(target.y * 10) / 10;
        }
        return target;
    }, [pointer, camera, raycaster]);

    const createRect = (p1: THREE.Vector3, p2: THREE.Vector3) => {
        const idBase = Date.now().toString();
        const c1 = new THREE.Vector3(Math.min(p1.x, p2.x), 0, Math.min(p1.z, p2.z));
        const c2 = new THREE.Vector3(Math.max(p1.x, p2.x), 0, Math.min(p1.z, p2.z));
        const c3 = new THREE.Vector3(Math.max(p1.x, p2.x), 0, Math.max(p1.z, p2.z));
        const c4 = new THREE.Vector3(Math.min(p1.x, p2.x), 0, Math.max(p1.z, p2.z));

        const edge1: SceneItem = { id: idBase + '_e1', type: 'edge', points: [c1, c2], color: 'black' };
        const edge2: SceneItem = { id: idBase + '_e2', type: 'edge', points: [c2, c3], color: 'black' };
        const edge3: SceneItem = { id: idBase + '_e3', type: 'edge', points: [c3, c4], color: 'black' };
        const edge4: SceneItem = { id: idBase + '_e4', type: 'edge', points: [c4, c1], color: 'black' };

        const center = new THREE.Vector3().addVectors(p1, p2).multiplyScalar(0.5);
        const width = Math.abs(p1.x - p2.x);
        const depth = Math.abs(p1.z - p2.z);

        const face: SceneItem = {
            id: idBase + '_f', type: 'face', geometryType: 'plane',
            position: [center.x, 0, center.z], rotation: [-Math.PI/2, 0, 0], scale: [width, depth, 1],
            color: 'white', edgeIds: [edge1.id, edge2.id, edge3.id, edge4.id]
        };

        return [edge1, edge2, edge3, edge4, face];
    };

    const updatePreview = useCallback(() => {
        if (drawingState === 'idle' || !startPoint) return;
        const currentPoint = getSnapPoint();
        if (!currentPoint) return;

        if (tool === 'rect') {
            let p2 = currentPoint;
            if (vcbInput) {
                const parts = vcbInput.split(',').map(s => parseFloat(s.trim()));
                if (!isNaN(parts[0])) {
                    const w = parts[0]/1000;
                    const h = parts.length > 1 ? parts[1]/1000 : w;
                    p2 = new THREE.Vector3(startPoint.x + w, 0, startPoint.z + h);
                }
            }
            const w = p2.x - startPoint.x;
            const d = p2.z - startPoint.z;
            setVcbValue(`${(Math.abs(w)*1000).toFixed(0)}, ${(Math.abs(d)*1000).toFixed(0)}`);
            setTempPoints([
                startPoint, new THREE.Vector3(startPoint.x + w, 0, startPoint.z),
                p2, new THREE.Vector3(startPoint.x, 0, startPoint.z + d), startPoint
            ]);
        }
        else if (tool === 'line') {
            let p2 = currentPoint;
            if(vcbInput && !isNaN(parseFloat(vcbInput))) {
                const dist = parseFloat(vcbInput) / 1000;
                const dir = new THREE.Vector3().subVectors(currentPoint, startPoint).normalize();
                p2 = new THREE.Vector3().copy(startPoint).add(dir.multiplyScalar(dist));
            }
            setVcbValue(`${(startPoint.distanceTo(p2)*1000).toFixed(0)}`);
            setTempPoints([startPoint, p2]);
        }
    }, [drawingState, startPoint, tool, vcbInput, getSnapPoint, setVcbValue]);

    const commitAction = useCallback(() => {
        if (drawingState === 'drawing' && startPoint && tempPoints) {
            if (tool === 'rect') {
                const newItems = createRect(startPoint, tempPoints[2]);
                setItems(prev => [...prev, ...newItems]);
            } else if (tool === 'line') {
                const newItem: SceneItem = {
                    id: Date.now().toString(), type: 'edge', points: [startPoint, tempPoints[1]], color: 'black'
                };
                setItems(prev => [...prev, newItem]);
            }
            setTempPoints(null);
            setStartPoint(null);
            setDrawingState('idle');
            setVcbValue('');
        }
        
        if (tool === 'pushpull' && vcbInput && pushTarget) {
            const dist = parseFloat(vcbInput) / 1000;
            if (pushTarget.geometryType === 'plane') {
                const newPos: [number, number, number] = [pushTarget.position![0], dist/2, pushTarget.position![2]];
                const newScale: [number, number, number] = [pushTarget.scale![0], dist, pushTarget.scale![1]];
                const newItem: SceneItem = {
                    ...pushTarget, geometryType: 'box', type: 'face',
                    position: newPos,
                    scale: newScale,
                    rotation: [0,0,0], color: '#eeeeee'
                };
                setItems(prev => prev.map(i => i.id === pushTarget.id ? newItem : i));
            } else if (pushTarget.geometryType === 'box') {
                const newH = pushTarget.scale![1] + dist;
                const newPos: [number, number, number] = [pushTarget.position![0], newH/2, pushTarget.position![2]];
                const newScale: [number, number, number] = [pushTarget.scale![0], newH, pushTarget.scale![2]];
                const newItem: SceneItem = { ...pushTarget, scale: newScale, position: newPos }; 
                setItems(prev => prev.map(i => i.id === pushTarget.id ? newItem : i));
            }
            setVcbValue('');
        }
    }, [drawingState, startPoint, tempPoints, tool, setItems, vcbInput, pushTarget]);

    useEffect(() => {
        if (drawingState === 'drawing') updatePreview();
    }, [pointer, drawingState, updatePreview]);

    useEffect(() => {
        if (onCommit) commitAction();
    }, [onCommit, commitAction]);

    const handlePointerDown = (e: any) => {
        if (tool === 'select' || tool === 'eraser' || tool === 'paint' || tool === 'rotate') return;
        e.stopPropagation();
        
        if (drawingState === 'idle') {
            const point = getSnapPoint();
            if (point) {
                setStartPoint(point);
                setDrawingState('drawing');
            }
        } else if (drawingState === 'drawing') {
            commitAction();
        }
    };

    const handleObjectClick = (e: any, item: SceneItem) => {
        e.stopPropagation();
        if (tool === 'select') {
            const multi = e.shiftKey;
            setItems(prev => prev.map(i => {
                if (i.id === item.id) return { ...i, selected: !i.selected }; 
                return multi ? i : { ...i, selected: false }; 
            }));
        } else if (tool === 'eraser') {
            setItems(prev => {
                let toDelete = [item.id];
                if (item.type === 'edge') {
                    const connectedFaces = prev.filter(f => f.type === 'face' && f.edgeIds?.includes(item.id));
                    toDelete.push(...connectedFaces.map(f => f.id));
                }
                return prev.filter(i => !toDelete.includes(i.id));
            });
        } else if (tool === 'pushpull') {
            setPushTarget(item);
            if (vcbInput) commitAction();
        } else if (tool === 'paint') {
            setItems(prev => prev.map(i => i.id === item.id ? { ...i, color: '#e57373' } : i)); 
        }
    };

    return (
        <>
            <mesh visible={false} onPointerDown={handlePointerDown} position={[0, -0.01, 0]} rotation={[-Math.PI/2, 0, 0]}>
                <planeGeometry args={[100, 100]} />
            </mesh>

            {items.map(item => (
                <group key={item.id}>
                    {item.type === 'face' && item.geometryType === 'plane' && item.position && item.rotation && item.scale && (
                        <mesh position={new THREE.Vector3(...item.position)} rotation={new THREE.Euler(...item.rotation)} scale={new THREE.Vector3(...item.scale)}
                            onClick={(e) => handleObjectClick(e, item)} onPointerOver={()=>setHoveredId(item.id)} onPointerOut={()=>setHoveredId(null)}>
                            <planeGeometry />
                            <meshStandardMaterial color={item.selected ? '#81d4fa' : item.color} side={THREE.DoubleSide} />
                        </mesh>
                    )}
                    {item.type === 'face' && item.geometryType === 'box' && item.position && item.rotation && item.scale && (
                        <mesh position={new THREE.Vector3(...item.position)} rotation={new THREE.Euler(...item.rotation)} scale={new THREE.Vector3(...item.scale)} castShadow receiveShadow
                            onClick={(e) => handleObjectClick(e, item)} onPointerOver={()=>setHoveredId(item.id)} onPointerOut={()=>setHoveredId(null)}>
                            <boxGeometry />
                            <meshStandardMaterial color={item.selected ? '#81d4fa' : item.color} />
                        </mesh>
                    )}
                    {item.type === 'edge' && item.points && (
                        <Line points={item.points} color={item.selected ? 'blue' : 'black'} lineWidth={3} onClick={(e: any) => handleObjectClick(e, item)} onPointerOver={()=>setHoveredId(item.id)} onPointerOut={()=>setHoveredId(null)} />
                    )}
                </group>
            ))}

            {tempPoints && <Line points={tempPoints} color="red" lineWidth={2} dashed />}
            
            {tool === 'rotate' && items.find(i => i.selected) && (
                <TransformControls object={scene.getObjectByProperty('uuid', items.find(i => i.selected)?.id)} mode="rotate" />
            )}
        </>
    );
};

const ThreeDSimulationPage: React.FC = () => {
    const navigate = useNavigate();
    const { mainMenus } = useMenu();
    
    const [isMobile, setIsMobile] = useState(window.innerWidth < 1024);
    const [isFullScreen, setIsFullScreen] = useState(false);
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
    const [isPageLoaded, setIsPageLoaded] = useState(false); // 마이프로젝트 페이지의 로딩 효과 적용
    
    const [activeTool, setActiveTool] = useState<ToolType>('select');
    const [vcbInput, setVcbInput] = useState('');
    const [vcbLabel, setVcbLabel] = useState('Select');
    const [commitTrigger, setCommitTrigger] = useState(false);

    const [items, setItems] = useState<SceneItem[]>([]);
    
    const toggleFullScreen = () => {
        if (!document.fullscreenElement) {
            document.documentElement.requestFullscreen();
            setIsFullScreen(true);
        } else {
            document.exitFullscreen();
            setIsFullScreen(false);
        }
    };

    useEffect(() => {
        requestAnimationFrame(() => setIsPageLoaded(true));
        const handleResize = () => setIsMobile(window.innerWidth < 1024);
        window.addEventListener('resize', handleResize);
        
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key.toLowerCase() === 'g' && !vcbInput) {
                handleGroup();
                return;
            }

            if (!vcbInput && !/[0-9\-]/.test(e.key)) {
                switch(e.key.toLowerCase()) {
                    case ' ': setActiveTool('select'); break;
                    case 'r': setActiveTool('rect'); break;
                    case 'l': setActiveTool('line'); break;
                    case 'c': setActiveTool('circle'); break;
                    case 'p': setActiveTool('pushpull'); break;
                    case 'e': setActiveTool('eraser'); break;
                    case 'b': setActiveTool('paint'); break;
                    case 't': setActiveTool('tape'); break;
                    case 'q': setActiveTool('rotate'); break;
                }
            }

            if (/^[0-9.,\-]$/.test(e.key)) setVcbInput(prev => prev + e.key);
            if (e.key === 'Backspace') setVcbInput(prev => prev.slice(0, -1));
            if (e.key === 'Enter') {
                setCommitTrigger(prev => !prev);
                setTimeout(() => setVcbInput(''), 100);
            }
            if (e.key === 'Escape') {
                setVcbInput('');
                setActiveTool('select');
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => {
            window.removeEventListener('resize', handleResize);
            window.removeEventListener('keydown', handleKeyDown);
        };
    }, [vcbInput, items]);

    const handleGroup = () => {
        const selected = items.filter(i => i.selected);
        if (selected.length < 2) return;
        
        const groupId = Date.now().toString() + '_grp';
        const groupItem: SceneItem = {
            id: groupId, type: 'group', name: 'Group', color: '',
            groupIds: selected.map(i => i.id)
        };
        
        const newItems = items.map(i => selected.find(s => s.id === i.id) ? { ...i, selected: false, parentId: groupId } : i);
        setItems([...newItems, groupItem]); 
    };

    return (
        // [중요] mp-page, mp-header 등 마이프로젝트 페이지의 클래스를 그대로 차용하여 레이아웃 구성
        <div className={`mp-page ${isFullScreen ? 'fullscreen' : ''}`} style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
            
            {/* 전체화면이 아닐 때만 헤더 표시 */}
            {!isFullScreen && (
                <header className="mp-header" style={{ flexShrink: 0 }}>
                    <div className={`mp-title-wrap ${isPageLoaded ? 'in-view' : ''}`}>
                        <h2 className="mp-title">3D 시뮬레이터</h2>
                        <div className="mp-title-underline"></div>
                    </div>
                    <p className={`mp-subtitle ${isPageLoaded ? 'in-view' : ''}`}>
                        상상하는 공간을 직접 설계하고 체험해보세요.
                    </p>
                </header>
            )}
            
            {/* 3D 툴 영역 (꽉 차게 설정) */}
            <div className="td-container" style={{ flex: 1, padding: isFullScreen ? 0 : '0 20px', marginBottom: isFullScreen ? 0 : '20px', marginTop: 0 }}>
                <div className="td-workspace" style={{ height: '100%' }}>
                    <div className="td-canvas-header">
                        <button className="td-fs-btn" onClick={toggleFullScreen}>
                            {isFullScreen ? <Icons.ExitFull /> : <Icons.FullScreen />}
                        </button>
                    </div>

                    {(!isMobile || (isMobile && isFullScreen)) && (
                        <Toolbar activeTool={activeTool} setTool={setActiveTool} onGroup={handleGroup} />
                    )}

                    <div className="td-canvas-container">
                        <Canvas shadows camera={{ position: [5, 8, 8], fov: 50 }}>
                            <color attach="background" args={['#f4f5f7']} />
                            <Sky sunPosition={[100, 20, 100]} />
                            <ambientLight intensity={0.7} />
                            <directionalLight position={[10, 20, 5]} intensity={1} castShadow />
                            <Environment preset="city" />
                            
                            <Suspense fallback={null}>
                                <Grid args={[50, 50]} sectionColor="#999" cellColor="#ddd" fadeDistance={50} position={[0,-0.01,0]} />
                                <SceneController 
                                    tool={activeTool} 
                                    items={items} 
                                    setItems={setItems}
                                    vcbInput={vcbInput}
                                    setVcbValue={() => {}} 
                                    setVcbLabel={setVcbLabel}
                                    onCommit={commitTrigger}
                                    isFullScreen={isFullScreen}
                                />
                                <ContactShadows opacity={0.4} scale={50} blur={2} far={4} />
                            </Suspense>
                            <OrbitControls makeDefault enabled={activeTool === 'select' || activeTool === 'rotate' || activeTool === 'paint' || activeTool === 'eraser'} />
                        </Canvas>

                        <div className="td-vcb-container">
                            <ValueControlBox value={vcbInput} label={vcbLabel} />
                        </div>
                    </div>
                </div>
            </div>

            {isMobile && !isFullScreen && (
                <div className="td-mobile-bar" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
                    <button onClick={()=>setActiveTool('select')} className={activeTool==='select'?'active':''}><Icons.Select/></button>
                    <button onClick={()=>setActiveTool('pushpull')} className={activeTool==='pushpull'?'active':''}><Icons.PushPull/></button>
                    <button onClick={toggleFullScreen}><Icons.FullScreen/></button>
                </div>
            )}

            {isMobileMenuOpen && <MobileMenu onClose={() => setIsMobileMenuOpen(false)} />}
        </div>
    );
};

export default ThreeDSimulationPage;