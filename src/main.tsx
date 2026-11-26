import { createRoot, hydrateRoot } from 'react-dom/client'
import { App, resolveRouteContent, UnavailablePage } from './App'
import { getRoute, normalizePath } from './routes'
import './styles.css'

const root = document.getElementById('root')

if (root) {
  const path = normalizePath(window.location.pathname)
  const route = getRoute(path)
  const hasStaticContent = root.dataset.prerenderedPath === route.path

  void resolveRouteContent(route).then((content) => {
    const view = <App path={path}>{content}</App>
    if (hasStaticContent) hydrateRoot(root, view)
    else createRoot(root).render(view)
  }).catch(() => {
    if (!hasStaticContent) {
      createRoot(root).render(<App path={path}><UnavailablePage /></App>)
    }
  })
}
