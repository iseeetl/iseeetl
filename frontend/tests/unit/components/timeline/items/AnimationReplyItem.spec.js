import { expect } from 'vitest';
import { shallowMount } from '../../../helpers/testUtils';
import AnimationReplyItem from '@/components/timeline/items/AnimationReplyItem.vue';

const baseStubs = {
  UiButton: true,
  UiIcon: true,
  UiTooltip: true,
};

const createWrapper = (overrides = {}) =>
  shallowMount(AnimationReplyItem, {
    stubs: baseStubs,
    props: {
      postId: 'post-1',
      post: { _id: 'post-1' },
      reply: { _id: 'reply-1', content: 'hi', room_tags: ['tag-1'], user: { _id: 'user-1', username: 'u1' } },
      columnIndex: 0,
      animatingItemsColumn: {},
      animationEnabled: true,
      needThreadLine: false,
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

describe('流れる返信の表示', () => {
  it('流す返信の本文をキーボードで操作できるボタンとして表示する', () => {
    const wrapper = createWrapper({ props: { animatingItemsColumn: { 'reply-1': true } } });
    const content = wrapper.get('button.animation-content');

    expect(content.text()).to.equal('hi');
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

    await wrapper.setProps({ animatingItemsColumn: { 'reply-1': true } });
    expect(content.element.disabled).to.equal(false);
    wrapper.get('.animation').element.classList.add('animation-complete');
    await wrapper.setProps({ animatingItemsColumn: { 'reply-1': false } });
    expect(content.element.disabled).to.equal(true);

    await wrapper.setProps({ animationEnabled: false, animatingItemsColumn: { 'reply-1': true } });
    expect(content.element.disabled).to.equal(true);
    wrapper.unmount();
  });

  it('一時停止中の編集ボタンを押してもアニメーションを再開しない', async () => {
    const wrapper = createWrapper({ props: { animatingItemsColumn: { 'reply-1': true } } });
    const content = wrapper.get('button.animation-content');
    await content.trigger('click');
    await wrapper.setProps({ animatingItemsColumn: { 'reply-1': false } });
    await wrapper.get('[data-testid="timeline-animation-reply-edit-button-reply-1"]').trigger('click');

    expect(wrapper.emitted().animationClicked).to.have.lengthOf(1);
    expect(wrapper.emitted().showEditReplyDialog).to.have.lengthOf(1);
    expect(content.attributes('aria-pressed')).to.equal('true');
    expect(content.find('ui-button-stub').exists()).to.equal(false);
    wrapper.unmount();
  });

  it('翻訳された本文も停止・再開の操作対象として表示する', () => {
    const wrapper = createWrapper({
      props: {
        reply: { _id: 'reply-1', content: 'original', lang: 'en', translations: [{ lang: 'ja', content: '翻訳文' }] },
        animatingItemsColumn: { 'reply-1': true },
      },
    });
    const content = wrapper.get('button.animation-content');
    expect(content.text()).to.equal('翻訳文');
    expect(content.get('.translate').attributes('dir')).to.equal('auto');
    expect(content.element.disabled).to.equal(false);
    wrapper.unmount();
  });

  it('開始前やアニメーション無効時は通知せず、無効化時に一時停止状態を初期化する', async () => {
    const wrapper = createWrapper();
    wrapper.vm.onAnimationClicked({ currentTarget: wrapper.get('.animation').element });
    expect(wrapper.emitted().animationClicked).to.equal(undefined);

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
      props: { animatingItemsColumn: { 'reply-1': true } },
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

  it('他ユーザの返信はタグ編集ボタンを表示できる', () => {
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
    const reply = wrapper.props('reply');
    const event = { currentTarget: { id: 'edit' } };

    wrapper.vm.showEditReplyDialog(post, reply, event);

    expect(wrapper.emitted().showEditReplyDialog[0][0]).to.equal(post);
    expect(wrapper.emitted().showEditReplyDialog[0][1]).to.equal(reply);
    expect(wrapper.emitted().showEditReplyDialog[0][2]).to.equal(event);
    wrapper.unmount();
  });

  it('タグ編集ボタンクリックは親投稿と返信のIDを通知する', async () => {
    const wrapper = createWrapper({ props: { reply: { _id: 'reply-1', room_tags: ['tag-1'], user: { _id: 'other-user' } } } });
    const reply = wrapper.props('reply');
    await wrapper.get('[data-testid="timeline-animation-reply-tag-button-reply-1"]').trigger('click');
    const [scope, tags] = wrapper.emitted().showEditTagDialog[0];
    expect(scope).to.deep.equal({ post_id: 'post-1', reply_id: 'reply-1' });
    expect(tags).to.deep.equal(reply.room_tags);
    wrapper.unmount();
  });

  it('本文ボタンで一時停止と再開を切り替え、アニメーション要素を通知する', async () => {
    const wrapper = createWrapper({ props: { animatingItemsColumn: { 'reply-1': true } } });
    const target = wrapper.get('.animation').element;
    const content = wrapper.get('button.animation-content');

    await content.trigger('click');
    await wrapper.setProps({ animatingItemsColumn: { 'reply-1': false } });

    expect(content.attributes('aria-pressed')).to.equal('true');
    expect(content.element.disabled).to.equal(false);
    expect(wrapper.emitted().animationClicked).to.deep.equal([[target]]);

    await content.trigger('click');
    await wrapper.setProps({ animatingItemsColumn: { 'reply-1': true } });

    expect(content.attributes('aria-pressed')).to.equal('false');
    expect(content.element.disabled).to.equal(false);
    expect(wrapper.emitted().animationClicked).to.deep.equal([[target], [target]]);
    wrapper.unmount();
  });
});
