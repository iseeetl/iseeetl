import { expect } from 'vitest';
import managementRoutes from '@/routes/management';

describe('管理画面のルート定義', () => {
  it('全てのルートに isManagement が設定されている', () => {
    managementRoutes.forEach((route) => {
      expect(route.meta && route.meta.isManagement).to.equal(true);
    });
  });

  it('コンポーネントは動的 import 関数で定義されている', () => {
    managementRoutes.forEach((route) => {
      expect(typeof route.component).to.equal('function');
    });
  });

  it('リクエストログ管理のルートを公開しない', () => {
    const removedRoutes = managementRoutes.filter(
      (route) => route.path === '/management/log' || route.name === 'RequestLogManagement'
    );

    expect(removedRoutes).to.deep.equal([]);
  });

  it('タイムラインのルーム一覧ルートはfloorIdをpropsで渡す', () => {
    const route = managementRoutes.find((item) => item.name === 'TimelineRoomDataManagement');

    expect(route.path).to.equal('/management/timeline/floor/:floorId');
    expect(route.props).to.equal(true);
  });

  it('AI解析設定管理画面を管理ルートとして公開する', () => {
    const route = managementRoutes.find((item) => item.name === 'AIAnalysisSettingManagement');

    expect(route.path).to.equal('/management/ai-analysis-settings');
    expect(route.meta).to.deep.equal({ isManagement: true });
    expect(typeof route.component).to.equal('function');
  });
});
