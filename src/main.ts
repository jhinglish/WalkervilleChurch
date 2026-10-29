import { $ } from './dom';
import { bindEvents } from './handlers';
import { render } from './render';
import { connect } from './store';

bindEvents();

void (async () => {
  const connected = await connect(render);
  if (!connected) {
    const view = $('#v');
    if (view) view.innerHTML = '<p class="mut">Sign in to claude.ai to use the roster.</p>';
  }
})();
