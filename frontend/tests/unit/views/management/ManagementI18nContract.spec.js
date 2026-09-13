import { expect } from 'vitest';
import { shallowMount } from '../../helpers/testUtils';
import CategoryTagManagement from '@/views/management/CategoryTagManagement.vue';
import AIAnalysisSettingManagement from '@/views/management/AIAnalysisSettingManagement.vue';
import FloorManagement from '@/views/management/FloorManagement.vue';
import FloorMemberManagement from '@/views/management/FloorMemberManagement.vue';
import FloorTagManagement from '@/views/management/FloorTagManagement.vue';
import PostManagement from '@/views/management/PostManagement.vue';
import RoomManagement from '@/views/management/RoomManagement.vue';
import RoomMemberManagement from '@/views/management/RoomMemberManagement.vue';
import RoomTagManagement from '@/views/management/RoomTagManagement.vue';
import SpamManagement from '@/views/management/SpamManagement.vue';
import TimelineDataManagement from '@/views/management/TimelineDataManagement.vue';
import TimelineRoomDataManagement from '@/views/management/TimelineRoomDataManagement.vue';
import UserManagement from '@/views/management/UserManagement.vue';
import { buildViewWithoutLifecycle, createMountOptions } from './helpers';

const JAPANESE_TEXT = /[ぁ-んァ-ヶ一-龠々ー]/u;

const views = [
  AIAnalysisSettingManagement,
  CategoryTagManagement,
  FloorManagement,
  FloorMemberManagement,
  FloorTagManagement,
  PostManagement,
  RoomManagement,
  RoomMemberManagement,
  RoomTagManagement,
  SpamManagement,
  TimelineDataManagement,
  TimelineRoomDataManagement,
  UserManagement,
];

describe('管理画面の翻訳', () => {
  views.forEach((view) => {
    it(`${view.name}は固定UI文言を翻訳関数へ通す`, () => {
      const wrapper = shallowMount(
        buildViewWithoutLifecycle(view),
        {
          ...createMountOptions({
            mocks: {
              $t: () => 'translated',
              $i18n: { locale: 'en' },
            },
          }),
          props: view === TimelineRoomDataManagement ? { floorId: 'floor-1' } : {},
        }
      );

      expect(wrapper.text()).not.to.match(JAPANESE_TEXT);
      const listBase = wrapper.findComponent({ name: 'ManagementListBase' });
      if (listBase.exists()) expect(listBase.props('title')).not.to.match(JAPANESE_TEXT);
    });
  });

  [
    { view: FloorMemberManagement, expected: 'フロアメンバー一覧' },
    { view: RoomMemberManagement, expected: 'ルームメンバー一覧' },
    { view: SpamManagement, expected: 'スパムワード一覧' },
    { view: TimelineDataManagement, expected: 'フロア一覧' },
    { view: TimelineRoomDataManagement, expected: 'ルーム一覧', props: { floorId: 'floor-1' } },
  ].forEach(({ view, expected, props = {} }) => {
    it(`${view.name}は「一覧」が重複しない表の名前を使う`, () => {
      const wrapper = shallowMount(buildViewWithoutLifecycle(view), {
        ...createMountOptions({
          mocks: {
            $t: (key, params) => {
              if (key === 'managementUi.tableLabel') return `${params.resource}一覧`;
              return key;
            },
          },
        }),
        props,
      });

      const tableLabel = wrapper.findComponent({ name: 'ManagementListBase' }).props('tableLabel');
      expect(tableLabel).to.equal(expected);
      expect(tableLabel).not.to.include('一覧一覧');
    });
  });
});
