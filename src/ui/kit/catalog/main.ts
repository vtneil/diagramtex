// Entry point of the kit catalog (public/kit.html), built by the dev server only.
import { mount } from 'svelte';
import { restoreLocale } from '../../../i18n';
// what TextPopup leans on, as the app loads it: maths and prose parsing, the input mode, highlighting, autocomplete
import '../../../domain/mathengine';
import '../../../domain/shapes';
import '../../services/mathinput';
import '../../services/texhighlight';
import '../../services/texcomplete.svelte';
import '../../services/dialog';
import Catalog from './Catalog.svelte';
restoreLocale();
mount(Catalog, { target: document.body });
