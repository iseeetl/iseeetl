import { expect } from 'vitest';
import { mount } from '@vue/test-utils';
import UiAvatar from '@/components/ui/UiAvatar.vue';
import UiIcon from '@/components/ui/UiIcon.vue';

describe('アバター（UiAvatar）', () => {
  it('既定40pxと指定sizeをstyleへ設定する', () => {
    const defaultAvatar = mount(UiAvatar);
    const largeAvatar = mount(UiAvatar, { props: { size: 64 } });

    expect(defaultAvatar.element.style.width).to.equal('40px');
    expect(defaultAvatar.element.style.height).to.equal('40px');
    expect(largeAvatar.element.style.width).to.equal('64px');
    expect(largeAvatar.element.style.height).to.equal('64px');
  });

  it('画像をdefault スロットへ描画する', () => {
    const wrapper = mount(UiAvatar, {
      slots: {
        default: '<img src="/avatar.png" alt="利用者">',
      },
    });
    const image = wrapper.find('img');

    expect(image.exists()).to.equal(true);
    expect(image.attributes('src')).to.equal('/avatar.png');
    expect(image.attributes('alt')).to.equal('利用者');
  });

  it('画像がない場合のアイコンを既定スロットへ描画する', () => {
    const Host = {
      components: {
        UiAvatar,
        UiIcon,
      },
      template: '<UiAvatar><UiIcon name="person" /></UiAvatar>',
    };
    const wrapper = mount(Host);
    const avatar = wrapper.findComponent(UiAvatar);
    const icon = avatar.findComponent(UiIcon);

    expect(icon.exists()).to.equal(true);
    expect(icon.text()).to.equal('person');
    expect(icon.attributes('aria-hidden')).to.equal('true');
  });
});
