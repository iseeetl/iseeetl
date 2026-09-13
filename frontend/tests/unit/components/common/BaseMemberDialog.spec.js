import { expect } from 'vitest';
import { reactive } from 'vue';
import { shallowMount } from '../../helpers/testUtils';
import BaseMemberDialog from '@/components/common/BaseMemberDialog.vue';

const UiDialogStub = {
  name: 'UiDialog',
  props: ['open', 'titleId', 'descriptionIds', 'initialFocus', 'closeOnEscape', 'closeOnBackdrop'],
  template:
    '<section><header><slot name="title" /></header><main><slot /></main><footer><slot name="actions" /></footer><aside><slot name="status" /></aside></section>',
};
const UiButtonStub = {
  name: 'UiButton',
  inheritAttrs: false,
  props: {
    appearance: String,
    tone: String,
    iconOnly: Boolean,
  },
  template: '<button v-bind="$attrs"><slot /></button>',
};
const UiAvatarStub = {
  name: 'UiAvatar',
  template: '<span class="avatar"><slot /></span>',
};
const UiIconStub = {
  name: 'UiIcon',
  props: ['name', 'size'],
  template: '<i :data-name="name" />',
};
const UiProgressStub = {
  name: 'UiProgress',
  inheritAttrs: false,
  props: ['mode', 'value'],
  template: '<div class="progress" v-bind="$attrs" />',
};

const defaultMember = {
  _id: 'm1',
  user: { _id: 'u1', username: 'User', image_name: null },
};

const createWrapper = (props = {}, options = {}) =>
  shallowMount(BaseMemberDialog, {
    stubs: {
      MemberCapabilityGuidance: false,
      UiAvatar: UiAvatarStub,
      UiButton: UiButtonStub,
      UiDialog: UiDialogStub,
      UiIcon: UiIconStub,
      UiProgress: UiProgressStub,
    },
    props: {
      visible: true,
      sending: false,
      titleId: 'title-id',
      titleText: 'title',
      closeLabel: 'close',
      deleteLabel: 'delete',
      members: [defaultMember],
      canDelete: () => true,
      progressAmount: 35,
      testIdPrefix: 'dialog-room-member',
      ...props,
    },
    mocks: {
      $t: (key) => key,
      $store: { getters: {} },
      ...(options.mocks || {}),
    },
    ...(options.attachTo ? { attachTo: options.attachTo } : {}),
  });

describe('共通メンバー一覧ダイアログ（BaseMemberDialog）', () => {
  it('visible propだけをopenへ渡し、閉鎖要求では表示状態を変更しない', async () => {
    const wrapper = createWrapper({ visible: false });
    const dialog = wrapper.findComponent(UiDialogStub);
    expect(dialog.props('open')).to.equal(false);

    await wrapper.setProps({ visible: true });
    expect(dialog.props('open')).to.equal(true);

    wrapper.vm.requestClose();
    expect(dialog.props('open')).to.equal(true);
    expect(wrapper.emitted()['request-close']).to.deep.equal([[]]);
    expect(wrapper.emitted()['update:visible']).to.equal(undefined);

    await wrapper.setProps({ visible: false });
    expect(dialog.props('open')).to.equal(false);
    expect(wrapper.vm).not.to.have.property('localVisible');
  });

  it('メンバーをリスト要素で表示し、代替アバターは装飾アイコンにする', () => {
    const wrapper = createWrapper();
    const icon = wrapper.findAllComponents(UiIconStub).find((item) => item.props('name') === 'person');

    expect(wrapper.find('ul.member-list').exists()).to.equal(true);
    expect(wrapper.findAll('ul.member-list > li')).to.have.lengthOf(1);
    expect(wrapper.find('li').text()).to.contain('User');
    expect(icon.props()).to.include({ name: 'person', size: 24 });
  });

  it('説明文と対象情報のスロットをUiDialogへ関連付ける', () => {
    const wrapper = shallowMount(BaseMemberDialog, {
      stubs: {
        UiAvatar: UiAvatarStub,
        UiButton: UiButtonStub,
        UiDialog: UiDialogStub,
        UiIcon: UiIconStub,
        UiProgress: UiProgressStub,
      },
      props: {
        visible: true,
        titleId: 'title-id',
        titleText: 'title',
        descriptionIds: 'target-context',
        closeLabel: 'close',
        deleteLabel: 'delete',
      },
      slots: {
        context: '<div id="target-context">target room</div>',
      },
    });

    expect(wrapper.findComponent(UiDialogStub).props('descriptionIds')).to.equal('target-context');
    expect(wrapper.get('#target-context').text()).to.equal('target room');
  });

  it('指定したメンバー権限の説明を表示し、説明参照へ追加する', () => {
    const wrapper = createWrapper({
      descriptionIds: 'target-context',
      guidanceScope: 'room',
    });
    const guidance = wrapper.get('[data-testid="member-capability-guidance"]');
    expect(guidance.attributes('id')).to.equal('title-id-capability-guidance');
    expect(guidance.findAll('h3').map((heading) => heading.text())).to.deep.equal([
      'memberCapabilities.allowed', 'memberCapabilities.denied',
    ]);
    expect(guidance.findAll('ul').map((list) => list.findAll('li').length)).to.deep.equal([3, 4]);
    expect(guidance.get('.member-guidance-note').text()).to.equal('memberCapabilities.roleNote');
    expect(wrapper.findComponent(UiDialogStub).props('descriptionIds')).to.equal(
      'target-context title-id-capability-guidance'
    );
  });

  it('権限説明がない場合は既存のダイアログ説明参照だけを維持する', () => {
    const wrapper = createWrapper({ descriptionIds: 'target-context' });

    expect(wrapper.find('[data-testid="member-capability-guidance"]').exists()).to.equal(false);
    expect(wrapper.findComponent(UiDialogStub).props('descriptionIds')).to.equal('target-context');
  });

  it('全メンバー一覧へ共通のダイアログ classを適用する', () => {
    const wrapper = createWrapper();
    expect(wrapper.findComponent(UiDialogStub).classes()).to.deep.equal(['base-member-dialog', 'ui-dialog--standard']);
  });

  it('一覧取得中も維持できるタイトルを初期フォーカス先にする', () => {
    const wrapper = createWrapper();
    const dialog = wrapper.findComponent(UiDialogStub);
    const title = wrapper.find('#title-id');

    expect(dialog.props('initialFocus')).to.equal('#title-id');
    expect(title.attributes('tabindex')).to.equal('-1');
  });

  it('画像があるメンバーは空altのアバター画像を描画する', () => {
    const wrapper = createWrapper({
      members: [
        {
          _id: 'm2',
          user: { _id: 'u2', username: 'Image User', image_name: 'avatar.png' },
        },
      ],
    });
    const image = wrapper.find('img');

    expect(image.attributes('src')).to.equal('/profile/u2/avatar.png');
    expect(image.attributes('alt')).to.equal('');
  });

  it('表示中の本人メンバーへ最新プロフィール名と画像削除を即時反映する', async () => {
    const profile = reactive({ name: '旧名', imageName: 'old.png' });
    const wrapper = createWrapper(
      {
        members: [
          {
            _id: 'm1',
            user: { _id: 'u1', username: '取得名', image_name: 'fetched.png' },
          },
        ],
      },
      {
        mocks: {
          $store: {
            getters: {
              resolveUserDisplayName: (user) => (user?._id === 'u1' ? profile.name : user?.username),
              resolveUserDisplayImageName: (user) =>
                user?._id === 'u1' ? profile.imageName : user?.image_name,
            },
          },
        },
      }
    );

    expect(wrapper.get('li').text()).to.contain('旧名');
    expect(wrapper.get('li img').attributes('src')).to.equal('/profile/u1/old.png');

    profile.name = '新名';
    profile.imageName = null;
    await wrapper.vm.$nextTick();

    expect(wrapper.get('li').text()).to.contain('新名');
    expect(wrapper.find('li img').exists()).to.equal(false);
    expect(wrapper.findAllComponents(UiIconStub).some((icon) => icon.props('name') === 'person')).to.equal(true);
  });

  it('UiDialogのrequest-closeを親への要求として通知し、sending中は拒否する', async () => {
    const wrapper = createWrapper();
    const dialog = wrapper.findComponent(UiDialogStub);

    dialog.vm.$emit('request-close', { reason: 'backdrop' });
    expect(wrapper.emitted()['request-close']).to.have.lengthOf(1);

    await wrapper.setProps({ sending: true });
    expect(dialog.props('closeOnEscape')).to.equal(false);
    expect(dialog.props('closeOnBackdrop')).to.equal(false);
    wrapper.vm.requestClose();
    expect(wrapper.emitted()['request-close']).to.have.lengthOf(1);
  });

  it('openedイベントと表示切替後のclosedイベントをそのまま通知する', () => {
    const wrapper = createWrapper();
    const dialog = wrapper.findComponent(UiDialogStub);
    const closedPayload = { reason: 'escape' };

    dialog.vm.$emit('opened');
    dialog.vm.$emit('closed', closedPayload);

    expect(wrapper.emitted().opened).to.deep.equal([[]]);
    expect(wrapper.emitted().closed).to.deep.equal([[closedPayload]]);
  });

  it('onDeleteで対象メンバーを通知する', () => {
    const wrapper = createWrapper();
    const member = { _id: 'm2', user: { _id: 'u2', username: 'User2' } };

    wrapper.vm.onDelete(member);

    expect(wrapper.emitted().delete[0][0]).to.deep.equal(member);
  });

  it('canDelete=falseの時は削除ボタンを描画しない', () => {
    const wrapper = createWrapper({ canDelete: () => false });
    expect(wrapper.find('[data-testid="dialog-room-member-delete-m1"]').exists()).to.equal(false);
  });

  it('削除操作は既定の配色を使い、解除操作では配色とアイコンを指定できる', () => {
    const defaultWrapper = createWrapper();
    const releaseWrapper = createWrapper({
      actionTone: 'primary',
      actionIcon: 'lock_open',
      deleteLabel: 'release',
    });
    const defaultAction = defaultWrapper
      .findAllComponents(UiButtonStub)
      .find((button) => button.classes().includes('delete-button'));
    const releaseAction = releaseWrapper
      .findAllComponents(UiButtonStub)
      .find((button) => button.classes().includes('delete-button'));

    expect(defaultAction.props('tone')).to.equal('danger');
    expect(
      defaultWrapper.findAllComponents(UiIconStub).some((icon) => icon.props('name') === 'lock_open')
    ).to.equal(false);
    expect(releaseAction.props('tone')).to.equal('primary');
    expect(
      releaseWrapper.findAllComponents(UiIconStub).some((icon) => icon.props('name') === 'lock_open')
    ).to.equal(true);
  });

  it('sending中の進捗へダイアログタイトルを関連付ける', () => {
    const wrapper = createWrapper({ sending: true });
    const progress = wrapper.findComponent(UiProgressStub);

    expect(progress.props()).to.include({ mode: 'determinate', value: 35 });
    expect(progress.attributes('aria-labelledby')).to.equal('title-id');
  });

  it('読込中・0件・失敗を区別し、エラー表示から再試行を通知する', async () => {
    const wrapper = createWrapper({ loadState: 'loading', loadingText: 'loading' });

    expect(wrapper.get('.member-list-state').attributes('role')).to.equal('status');
    expect(wrapper.get('.member-list-state').text()).to.equal('loading');
    expect(wrapper.findComponent(UiProgressStub).props('mode')).to.equal('indeterminate');
    expect(wrapper.findComponent(UiDialogStub).props('closeOnEscape')).to.equal(true);

    await wrapper.setProps({ loadState: 'empty', emptyText: 'empty' });
    expect(wrapper.get('.member-list-state').text()).to.equal('empty');
    expect(wrapper.find('.member-list').exists()).to.equal(false);

    await wrapper.setProps({ loadState: 'error', errorText: 'failed', retryLabel: 'retry' });
    expect(wrapper.get('[role="alert"]').text()).to.equal('failed');
    await wrapper.find('.member-list-state--error button').trigger('click');
    expect(wrapper.emitted().retry).to.deep.equal([[]]);
  });

  it('各メンバーの削除操作に読み上げ用の名前とフォーカス用IDを設定する', () => {
    const wrapper = createWrapper({
      deleteAriaLabel: (member) => `remove ${member.user.username}`,
    });
    const button = wrapper.get('.delete-button');

    expect(button.attributes('aria-label')).to.equal('remove User');
    expect(button.attributes('id')).to.equal('title-id-delete-m1');
  });

  it('削除後フォーカスをメンバー操作または一覧見出しへ移せる', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const wrapper = createWrapper({}, { attachTo: host });

    expect(wrapper.vm.focusDeleteButton('m1')).to.equal(true);
    expect(document.activeElement?.id).to.equal('title-id-delete-m1');
    expect(wrapper.vm.focusHeading()).to.equal(true);
    expect(document.activeElement?.id).to.equal('title-id');

    wrapper.unmount();
    host.remove();
  });

  it('makeTestIdはprefixとsuffixを連結する', () => {
    const wrapper = createWrapper();
    expect(wrapper.vm.makeTestId('close-desktop')).to.equal('dialog-room-member-close-desktop');
  });
});
