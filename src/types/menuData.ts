// src/types/menuData.ts

export interface MenuData {
  key: string;
  title: string;
  subMenus: string[];
}

export const kAppMenus: MenuData[] = [
  {
    key: 'menu1',
    title: '메뉴1',
    subMenus: ['하위메뉴 1-A', '하위메뉴 1-B', '하위메뉴 1-C'],
  },
  {
    key: 'menu2',
    title: '메뉴2',
    subMenus: ['하위메뉴 2-A', '하위메뉴 2-B'],
  },
  {
    key: 'menu3',
    title: '메뉴3',
    subMenus: ['하위메뉴 3-A', '하위메뉴 3-B', '하위메뉴 3-C', '하위메뉴 3-D'],
  },
];