import { expect } from 'vitest';
import { shallowMount } from '../../../helpers/testUtils';
import AnimationPostItem from '@/components/timeline/items/AnimationPostItem.vue';

const baseStubs = {
  UiButton: true,
  UiIcon: true,
  UiTooltip: true,
};

const createWrapper = (overrides = {}) =>
  shallowMount(AnimationPostItem, {
    stubs: baseStubs,
    props: {
      post: { _id: 'post-1', content: 'hello', room_tags: ['tag-1'], user: { _id: 'user-1', username: 'u1' } },
      columnIndex: 0,
      animatingItemsColumn: {},
      animationEnabled: true,
      ...(overrides.props || {}),
    },
    mocks: {
      $store: overrides.store || {
        getters: {
          userId: 'user-1',
          userRole: 'User',
          roomRole: 'User',
          displayUserKickButton: true,
        },
      },
      $t: (key) => key,
      $i18n: { locale: 'ja' },
      ...(overrides.mocks || {}),
    },
  });

describe('流れる投稿の表示', () => {
  it('流す投稿の本文をキーボードで操作できるボタンとして表示する', () => {
    const wrapper = createWrapper({ props: { animatingItemsColumn: { 'post-1': true } } });
    const content = wrapper.get('button.animation-content');

    expect(content.text()).to.equal('hello');
    expect(content.attributes('type')).to.equal('button');
    expect(content.element.disabled).to.equal(false);
    expect(content.attributes('aria-pressed')).to.equal('false');
    expect(content.attributes('title')).to.equal('アニメーションを一時停止または再開');
    expect(content.find('button').exists()).to.equal(false);
    wrapper.unmount();
  });

  it('開始前・完了後・無効時は本文ボタンをTab移動の対象にしない', async () => {
    const wrapper = createWrapper();
    const content = wrapper.get('button.animation-content');
    expect(content.element.disabled).to.equal(true);

    await wrapper.setProps({ animatingItemsColumn: { 'post-1': true } });
    expect(content.element.disabled).to.equal(false);
    wrapper.get('.animation').element.classList.add('animation-complete');
    await wrapper.setProps({ animatingItemsColumn: { 'post-1': false } });
    expect(content.element.disabled).to.equal(true);

    await wrapper.setProps({ animationEnabled: false, animatingItemsColumn: { 'post-1': true } });
    expect(content.element.disabled).to.equal(true);
    wrapper.unmount();
  });

  it('一時停止中の編集ボタンを押してもアニメーションを再開しない', async () => {
    const wrapper = createWrapper({ props: { animatingItemsColumn: { 'post-1': true } } });
    const content = wrapper.get('button.animation-content');
    await content.trigger('click');
    await wrapper.setProps({ animatingItemsColumn: { 'post-1': false } });
    await wrapper.get('[data-testid="timeline-animation-post-edit-button-post-1"]').trigger('click');

    expect(wrapper.emitted().animationClicked).to.have.lengthOf(1);
    expect(wrapper.emitted().showEditPostDialog).to.have.lengthOf(1);
    expect(content.attributes('aria-pressed')).to.equal('true');
    expect(content.find('ui-button-stub').exists()).to.equal(false);
    wrapper.unmount();
  });

  it('翻訳された本文も停止・再開の操作対象として表示する', () => {
    const wrapper = createWrapper({
      props: {
        post: { _id: 'post-1', content: 'original', lang: 'en', translations: [{ lang: 'ja', content: '翻訳文' }] },
        animatingItemsColumn: { 'post-1': true },
      },
    });
    const content = wrapper.get('button.animation-content');
    expect(content.text()).to.equal('翻訳文');
    expect(content.get('.translate').attributes('dir')).to.equal('auto');
    expect(content.element.disabled).to.equal(false);
    wrapper.unmount();
  });

  it('開始待ち・無効・完了の状態では本文を押しても何もしない', () => {
    const waiting = createWrapper();
    waiting.vm.onAnimationClicked({ currentTarget: waiting.get('.animation').element });
    expect(waiting.emitted().animationClicked).to.equal(undefined);

    const disabled = createWrapper({
      props: { animationEnabled: false, animatingItemsColumn: { 'post-1': true } },
    });
    disabled.vm.onAnimationClicked({ currentTarget: disabled.get('.animation').element });
    expect(disabled.emitted().animationClicked).to.equal(undefined);

    const complete = createWrapper({ props: { animatingItemsColumn: { 'post-1': true } } });
    complete.get('.animation').element.classList.add('animation-complete');
    complete.vm.onAnimationClicked({ currentTarget: complete.get('.animation').element });
    expect(complete.emitted().animationClicked).to.equal(undefined);
  });

  it('アニメーションを無効にすると一時停止状態を初期化する', async () => {
    const wrapper = createWrapper({ props: { animatingItemsColumn: { 'post-1': true } } });
    wrapper.setData({ animationPaused: true });
    await wrapper.setProps({ animationEnabled: false });
    expect(wrapper.vm.animationPaused).to.equal(false);
  });

  it('削除権限があれば削除ボタンを表示できる', () => {
    const wrapper = createWrapper();
    expect(wrapper.vm.canShowDeleteButton).to.equal(true);
    wrapper.unmount();
  });

  it('アニメーション中は削除ボタンを表示しない', () => {
    const wrapper = createWrapper({
      props: { animatingItemsColumn: { 'post-1': true } },
    });
    expect(wrapper.vm.canShowDeleteButton).to.equal(false);
    wrapper.unmount();
  });

  it('編集権限があれば編集ボタンを表示できる', () => {
    const wrapper = createWrapper();
    expect(wrapper.vm.canShowEditButton).to.equal(true);
    wrapper.unmount();
  });

  it('管理権限があればキックボタンを表示できる', () => {
    const wrapper = createWrapper({
      store: {
        getters: {
          userId: 'user-2',
          userRole: 'Administrator',
          roomRole: 'User',
          displayUserKickButton: true,
        },
      },
    });

    expect(wrapper.vm.canShowKickButton).to.equal(true);
    wrapper.unmount();
  });

  it('他ユーザの投稿はタグ編集ボタンを表示できる', () => {
    const wrapper = createWrapper({
      store: {
        getters: {
          userId: 'user-2',
          userRole: 'User',
          roomRole: 'User',
          displayUserKickButton: true,
        },
      },
    });

    expect(wrapper.vm.canShowEditTagButton).to.equal(true);
    wrapper.unmount();
  });

  it('編集ボタンクリックで編集ダイアログを通知する', () => {
    const wrapper = createWrapper();
    const post = wrapper.props('post');

    wrapper.vm.showEditPostDialog(post);

    expect(wrapper.emitted().showEditPostDialog[0]).to.deep.equal([post, true]);
    wrapper.unmount();
  });

  it('タグ編集ボタンクリックでタグ編集ダイアログを通知する', () => {
    const wrapper = createWrapper();
    const post = wrapper.props('post');
    const event = { currentTarget: { id: 'tag' } };
    const payload = { post_id: post._id, reply_id: null };

    wrapper.vm.showEditTagDialog(payload, post.room_tags, event);

    expect(wrapper.emitted().showEditTagDialog[0][0]).to.deep.equal(payload);
    expect(wrapper.emitted().showEditTagDialog[0][1]).to.deep.equal(post.room_tags);
    expect(wrapper.emitted().showEditTagDialog[0][2]).to.equal(event);
    wrapper.unmount();
  });

  it('本文ボタンで一時停止と再開を切り替え、アニメーション要素を通知する', async () => {
    const wrapper = createWrapper({ props: { animatingItemsColumn: { 'post-1': true } } });
    const target = wrapper.get('.animation').element;
    const content = wrapper.get('button.animation-content');

    await content.trigger('click');
    await wrapper.setProps({ animatingItemsColumn: { 'post-1': false } });

    expect(content.attributes('aria-pressed')).to.equal('true');
    expect(content.element.disabled).to.equal(false);
    expect(wrapper.emitted().animationClicked).to.deep.equal([[target]]);

    await content.trigger('click');
    await wrapper.setProps({ animatingItemsColumn: { 'post-1': true } });

    expect(content.attributes('aria-pressed')).to.equal('false');
    expect(content.element.disabled).to.equal(false);
    expect(wrapper.emitted().animationClicked).to.deep.equal([[target], [target]]);
    wrapper.unmount();
  });
});
