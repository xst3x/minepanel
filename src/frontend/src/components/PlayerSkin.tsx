import { assetUrl } from '../lib/api';
import { fallbackSkin, playerSkinUrl } from '../lib/playerSkin';

export default function PlayerSkin({ name, uuid, large = false }: { name?: string; uuid?: string; large?: boolean }) {
  return <span className={`player-skin-frame${large ? ' player-skin-frame-detail' : ''}`}><img className={`player-skin${large ? ' player-skin-detail' : ''}`}
    src={assetUrl(playerSkinUrl(name, uuid))} alt={`${name || 'Player'}'s 3D skin`}
    width={large ? 72 : 36} height={large ? 128 : 64}
    loading="lazy" decoding="async" referrerPolicy="no-referrer"
    onError={e => { if (e.currentTarget.src !== fallbackSkin) e.currentTarget.src = fallbackSkin; }} /></span>;
}
