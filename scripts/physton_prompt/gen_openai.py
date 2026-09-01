from scripts.physton_prompt.get_lang import get_lang
from scripts.physton_prompt.get_translate_apis import unprotected_translate_api_config


def gen_openai(messages, api_config):
    import openai
    from distutils.version import LooseVersion
    api_config = unprotected_translate_api_config('chatgpt_key', api_config)
    # Keep the credentials local: these calls run on a threadpool, and writing to
    # openai.api_base / openai.api_key would let concurrent requests (e.g. a
    # translation using a different provider) overwrite each other's config.
    api_base = api_config.get('api_base', 'https://api.openai.com/v1')
    api_key = api_config.get('api_key', '')
    model = api_config.get('model', 'gpt-3.5-turbo')
    if not api_key:
        raise Exception(get_lang('is_required', {'0': 'API Key'}))
    if not messages or len(messages) == 0:
        raise Exception(get_lang('is_required', {'0': 'messages'}))
    if LooseVersion(openai.__version__) < LooseVersion('1.0.0'):
        completion = openai.ChatCompletion.create(model=model, messages=messages, timeout=60,
                                                  api_key=api_key, api_base=api_base)
    else:
        from openai import OpenAI
        client = OpenAI(
            base_url=api_base,
            api_key=api_key,
        )
        completion = client.chat.completions.create(model=model, messages=messages, timeout=60)
    if len(completion.choices) == 0:
        raise Exception(get_lang('no_response_from', {'0': 'OpenAI'}))
    content = completion.choices[0].message.content
    return content
