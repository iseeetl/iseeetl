import { expect } from 'vitest';
import { mount } from '@vue/test-utils';
import AIAnalysisSettingFormFields from '@/components/analysis/AIAnalysisSettingFormFields.vue';
import { createApplicationI18n } from '@/i18n.js';

const defaultProps = () => ({
  idPrefix: 'analysis-setting',
  formTitleId: 'analysis-setting-title',
  tagValue: 'tag-1',
  kindValue: 'vision',
  promptValue: 'prompt',
  resultUserValue: 'user-1',
  searchValue: 'Alice',
  tags: [
    { _id: 'tag-1', name: 'Tag A' },
    { _id: 'tag-2', name: 'Tag B' },
  ],
  analysisKinds: ['vision', 'speech'],
  kindLabel: (kind) => `kind:${kind}`,
  promptDescription: 'prompt description',
  resultUsers: [
    { _id: 'user-1', username: 'Alice' },
    { _id: 'user-2', username: 'Bob' },
  ],
  searchCompleted: true,
});

const createWrapper = (props = {}, { locale = 'ja', getters = {} } = {}) =>
  mount(AIAnalysisSettingFormFields, {
    attachTo: document.body,
    props: {
      ...defaultProps(),
      ...props,
    },
    global: {
      plugins: [createApplicationI18n({ locale })],
      mocks: {
        $store: { getters },
        $t: (key, params) => (params ? `${key}:${JSON.stringify(params)}` : key),
      },
    },
  });

describe('AI解析設定の入力項目（AIAnalysisSettingFormFields）', () => {
  it.each([
    ['ja', '選択中:'],
    ['en', 'Selected:'],
  ])('%sの選択中表示で、ユーザ名の直前に画像を表示する', (locale, label) => {
    const wrapper = createWrapper({
      searchCompleted: false,
      selectedResultUser: { _id: 'user-1', username: 'Alice', image_name: 'alice.png' },
    }, { locale });
    const summary = wrapper.get('.ai-analysis-setting-fields__selected-user');
    const image = summary.get('img');

    expect(summary.text()).to.equal(`${label} Alice`);
    expect(image.attributes('src')).to.equal('/profile/user-1/alice.png');
    expect(image.attributes('alt')).to.equal('');
    expect(image.element.parentElement.getAttribute('aria-hidden')).to.equal('true');
    expect(image.element.parentElement.nextElementSibling.textContent.trim()).to.equal('Alice');
  });

  it('検索候補に画像と代替アイコンを表示し、画像付き候補も選択できる', async () => {
    const wrapper = createWrapper({
      resultUsers: [
        { _id: 'user-1', username: 'Alice' },
        { _id: 'user-2', username: 'Bob', image_name: 'bob.png' },
      ],
    });
    const options = wrapper.findAll('.ai-analysis-setting-fields__result-user-option');

    expect(options[0].find('img').exists()).to.equal(false);
    expect(options[0].get('.ui-avatar .ui-icon').text()).to.equal('person');
    expect(options[1].get('img').attributes('src')).to.equal('/profile/user-2/bob.png');
    expect(options[1].get('.ai-analysis-setting-fields__user-name').text()).to.equal('Bob');
    await options[1].get('input').setValue(true);
    expect(wrapper.emitted('update:resultUserValue')).to.deep.equal([['user-2']]);
    await wrapper.setProps({ resultUserValue: 'user-2' });
    expect(options[0].get('input').element.checked).to.equal(false);
    expect(options[1].get('input').element.checked).to.equal(true);
  });

  it.each([
    [false, '.ai-analysis-setting-fields__selected-user'],
    [true, '.ai-analysis-setting-fields__result-user-option'],
  ])('検索完了=%sで画像取得失敗時は代替表示し、別の画像へ切り替えられる', async (searchCompleted, selector) => {
    const user = { _id: 'user-1', username: 'Alice', image_name: 'missing.png' };
    const wrapper = createWrapper({ searchCompleted, selectedResultUser: user, resultUsers: [user] });

    await wrapper.get(`${selector} img`).trigger('error');
    expect(wrapper.find(`${selector} img`).exists()).to.equal(false);
    expect(wrapper.get(`${selector} .ui-avatar .ui-icon`).text()).to.equal('person');
    expect(wrapper.get(`${selector} .ai-analysis-setting-fields__user-name`).text()).to.equal('Alice');
    const updatedUser = { ...user, image_name: 'updated.png' };
    await wrapper.setProps({ selectedResultUser: updatedUser, resultUsers: [updatedUser] });
    expect(wrapper.get(`${selector} img`).attributes('src')).to.equal('/profile/user-1/updated.png');
    const nextUser = { _id: 'user-2', username: 'Bob', image_name: 'bob.png' };
    await wrapper.setProps({ selectedResultUser: nextUser, resultUsers: [nextUser] });
    expect(wrapper.get(`${selector} img`).attributes('src')).to.equal('/profile/user-2/bob.png');
    expect(wrapper.get(`${selector} .ai-analysis-setting-fields__user-name`).text()).to.equal('Bob');
  });

  it('初期ユーザがなければ選択中表示を出さず、画像未設定のユーザを選ぶと代替アイコンを表示する', async () => {
    const wrapper = createWrapper({ searchCompleted: false });
    expect(wrapper.find('.ai-analysis-setting-fields__selected-user').exists()).to.equal(false);
    expect(wrapper.find('.ui-avatar').exists()).to.equal(false);

    await wrapper.setProps({ selectedResultUser: { _id: 'user-1', username: 'Alice' } });
    expect(wrapper.find('.ai-analysis-setting-fields__selected-user img').exists()).to.equal(false);
    expect(wrapper.get('.ai-analysis-setting-fields__selected-user .ui-icon').text()).to.equal('person');
  });

  it('プロフィールの表示用情報がある場合は最新の名前と画像を使う', () => {
    const wrapper = createWrapper({
      searchCompleted: false,
      selectedResultUser: { _id: 'user-1', username: 'Old', image_name: 'old.png' },
    }, {
      getters: {
        resolveUserDisplayName: () => 'Current',
        resolveUserDisplayImageName: () => 'current.png',
      },
    });
    expect(wrapper.get('.ai-analysis-setting-fields__selected-user').text()).to.equal('選択中: Current');
    expect(wrapper.get('.ai-analysis-setting-fields__selected-user img').attributes('src')).to.equal(
      '/profile/user-1/current.png'
    );
  });

  it('渡された値・ID・補足説明・選択済みユーザを各入力項目へ反映する', () => {
    const wrapper = createWrapper({
      tagError: 'tag error',
      validationError: 'form error',
    });

    expect(wrapper.attributes('aria-labelledby')).to.equal('analysis-setting-title');
    expect(wrapper.attributes('aria-busy')).to.equal('false');
    expect(wrapper.get('#analysis-setting-tag').element.value).to.equal('tag-1');
    expect(wrapper.get('#analysis-setting-kind').element.value).to.equal('vision');
    expect(wrapper.get('#analysis-setting-prompt').element.value).to.equal('prompt');
    expect(wrapper.get('#analysis-setting-prompt-description').text()).to.equal(
      'prompt description'
    );
    expect(wrapper.get('#analysis-setting-result-user-search').element.value).to.equal('Alice');
    expect(wrapper.get('input[type="radio"][value="user-1"]').element.checked).to.equal(true);
    expect(wrapper.get('input[type="radio"][value="user-2"]').element.checked).to.equal(false);
    expect(wrapper.get('#analysis-setting-tag').attributes('aria-invalid')).to.equal('true');
    expect(wrapper.get('#analysis-setting-tag-error').text()).to.equal('tag error');
    expect(wrapper.get('.ai-analysis-setting-fields__form-error').text()).to.equal('form error');
  });

  it('入力変更と検索操作を親へイベントで通知する', async () => {
    const wrapper = createWrapper();

    await wrapper.get('#analysis-setting-tag').setValue('tag-2');
    await wrapper.get('#analysis-setting-kind').setValue('speech');
    await wrapper.get('#analysis-setting-prompt').setValue('next prompt');
    await wrapper.get('#analysis-setting-result-user-search').setValue('Bob');
    await wrapper.get('input[type="radio"][value="user-2"]').setValue(true);
    await wrapper.get('.ai-analysis-setting-fields__search-control button').trigger('click');
    await wrapper.get('#analysis-setting-result-user-search').trigger('keydown', { key: 'Enter' });

    expect(wrapper.emitted('update:tagValue')).to.deep.equal([['tag-2']]);
    expect(wrapper.emitted('update:kindValue')).to.deep.equal([['speech']]);
    expect(wrapper.emitted('update:promptValue')).to.deep.equal([['next prompt']]);
    expect(wrapper.emitted('update:searchValue')).to.deep.equal([['Bob']]);
    expect(wrapper.emitted('update:resultUserValue')).to.deep.equal([['user-2']]);
    expect(wrapper.emitted('search')).to.have.lengthOf(2);
  });

  it('検索中は検索操作だけを無効にし、保存中はすべての入力を無効にする', async () => {
    const wrapper = createWrapper({
      searching: true,
      loadingText: 'loading',
    });

    ['#analysis-setting-tag', '#analysis-setting-kind', '#analysis-setting-prompt'].forEach(
      (selector) => expect(wrapper.get(selector).attributes('disabled')).to.equal(undefined)
    );
    expect(wrapper.get('#analysis-setting-result-user-search').attributes('disabled')).not.to.equal(
      undefined
    );
    expect(wrapper.get('.ai-analysis-setting-fields__search-control button').attributes('disabled')).not.to.equal(
      undefined
    );
    expect(wrapper.get('input[type="radio"]').attributes('disabled')).not.to.equal(undefined);
    expect(wrapper.get('fieldset').element.disabled).to.equal(true);
    expect(wrapper.attributes('aria-busy')).to.equal('true');
    expect(wrapper.get('[role="status"]').text()).to.equal('loading');

    await wrapper.setProps({ searching: false, sending: true });

    expect(
      wrapper
        .findAll('select, textarea, input, button')
        .every((control) => control.attributes('disabled') !== undefined)
    ).to.equal(true);
    expect(wrapper.attributes('aria-busy')).to.equal('true');
  });

  it('入力不備のある項目へ親からフォーカスできる', () => {
    const wrapper = createWrapper();
    const targets = [
      ['focusTag', '#analysis-setting-tag'],
      ['focusKind', '#analysis-setting-kind'],
      ['focusPrompt', '#analysis-setting-prompt'],
      ['focusResultUserSearch', '#analysis-setting-result-user-search'],
    ];

    targets.forEach(([method, selector]) => {
      expect(wrapper.vm[method]()).to.equal(true);
      expect(document.activeElement).to.equal(wrapper.get(selector).element);
    });
  });
});
