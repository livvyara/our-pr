// src/types/menuTypes.ts
import { Timestamp } from 'firebase/firestore';

// Firestore의 'mainMenus' 컬렉션 문서 타입
export interface MainMenuData {
  id: string; // (Firestore 문서 ID)
  key: string; // (예: 'menu1')
  title: string; // (예: '아워서포터')
  order: number;
  roles: string[]; // (예: ['customer', 'partner'])
}

// Firestore의 'subMenus' 컬렉션 'items' 배열의 요소 타입
export interface SubMenuItemData {
  title: string;
  path: string;
  order: number;
  roles: string[]; // (접근 가능 등급)
}

// 'subMenus' 컬렉션의 문서 타입
export interface SubMenuDocument {
  items: SubMenuItemData[];
  updatedAt?: Timestamp;
}