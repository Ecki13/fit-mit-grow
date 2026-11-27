(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const url = window.FITGROW_SUPABASE_URL || '';
  const key = window.FITGROW_SUPABASE_PUBLISHABLE_KEY || '';
  const configured = url.startsWith('https://') && url.includes('.supabase.co') && key.startsWith('sb_publishable_');
  let client = null, currentUser = null, activeUserId = null, syncing = false, syncQueued = false, initialSyncComplete = false;
  let friendsCache = [];
  let plantCatalogCache = [];
  const status = (message, bad = false) => { const el=$('accountStatus'); if(!el)return; el.textContent=message; el.style.color=bad?'#b33':'var(--leaf)'; };
  const escapeHtml = value => String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const localData = () => window.fitGrowGetAppData ? window.fitGrowGetAppData() : {activities:[],customActivities:[],plants:[]};
  const validDate = value => /^\d{4}-\d{2}-\d{2}$/.test(String(value||''))?value:new Date().toISOString().slice(0,10);
  const showLoginState = user => {
    currentUser=user||null;
    $('authForm').style.display=currentUser?'none':'block';
    $('accountLoggedIn').style.display=currentUser?'block':'none';
    $('friendArea').style.display=currentUser?'block':'none';
    $('groupArea').style.display=currentUser?'block':'none';
    $('accountEmail').textContent=currentUser?.email||'';
    if(!currentUser){$('adminPanel').style.display='none';$('adminUserList').innerHTML='';friendsCache=[];$('groupFriends').innerHTML='<div class="empty">Bitte anmelden, um Gruppen zu verwalten.</div>';$('groupInvites').innerHTML='';$('groupsList').innerHTML='<div class="empty">Bitte anmelden, um deine Gruppen zu sehen.</div>';}
  };
  async function loadProfile(){if(!currentUser)return;const {data,error}=await client.from('profiles').select('username,display_name').eq('id',currentUser.id).maybeSingle();if(error)throw error;$('profileUsername').value=data?.username||'';$('profileDisplayName').value=data?.display_name||'';}
  async function loadAdminPanel(){const {data:isAdmin,error:adminError}=await client.rpc('is_admin');if(adminError)throw adminError;if(!isAdmin){$('adminPanel').style.display='none';return;}$('adminPanel').style.display='block';$('adminUserList').innerHTML='<div class="empty">Benutzer werden geladen …</div>';const {data,error}=await client.from('profiles').select('username,display_name,created_at').order('created_at',{ascending:false});if(error)throw error;$('adminUserList').innerHTML=(data||[]).map(p=>`<div class="entry"><div><strong>${escapeHtml(p.display_name||p.username||'Ohne Anzeigename')}</strong><small>@${escapeHtml(p.username||'')} · Registriert: ${escapeHtml(p.created_at?new Date(p.created_at).toLocaleDateString('de-DE'):'—')}</small></div><span class="badge">Nutzer</span></div>`).join('')||'<div class="empty">Noch keine Benutzerprofile vorhanden.</div>';}
  async function uploadLocalActivities(){if(!currentUser)return;const activities=Array.isArray(localData().activities)?localData().activities:[];if(!activities.length)return;const rows=activities.map(a=>({user_id:currentUser.id,local_id:String(a.id),activity_type:String(a.type||'Sonstiges'),duration_minutes:Math.max(0,Number(a.duration)||0),repetitions:Math.max(0,Number(a.reps)||0),distance_km:Math.max(0,Number(a.distance)||0),xp:Math.max(0,Number(a.xp)||0),notes:String(a.note||'').slice(0,2000),activity_date:validDate(a.date),visibility:a.visibility==='private'?'private':'friends'}));for(let i=0;i<rows.length;i+=250){const {error}=await client.from('activities').upsert(rows.slice(i,i+250),{onConflict:'user_id,local_id'});if(error)throw error;}}
  async function loadCloudActivities(){const {data,error}=await client.from('activities').select('id,local_id,activity_type,duration_minutes,repetitions,distance_km,xp,notes,activity_date,visibility,created_at').eq('user_id',currentUser.id).order('activity_date',{ascending:false});if(error)throw error;for(const row of data||[]){if(!row.local_id){const stableId=`cloud-${row.id}`;const {error:updateError}=await client.from('activities').update({local_id:stableId}).eq('id',row.id).eq('user_id',currentUser.id);if(updateError)throw updateError;row.local_id=stableId;}}return (data||[]).map(r=>({id:r.local_id||`cloud-${r.id}`,type:r.activity_type,reps:Number(r.repetitions||0),duration:Number(r.duration_minutes||0),distance:Number(r.distance_km||0),date:r.activity_date||(r.created_at?r.created_at.slice(0,10):validDate()),note:r.notes||'',visibility:r.visibility||'friends',xp:Number(r.xp||0)}));}
  function mergeActivities(local,remote){const map=new Map();for(const a of local||[])map.set(String(a.id),a);for(const a of remote||[])map.set(String(a.id),a);return [...map.values()].sort((a,b)=>String(b.date||'').localeCompare(String(a.date||''))||String(b.id).localeCompare(String(a.id)));}
  async function syncActivities(initial=false){if(!currentUser||syncing){if(syncing)syncQueued=true;return;}syncing=true;try{if(initial&&!initialSyncComplete){if(!localStorage.getItem('fitGrowGuestBackup'))localStorage.setItem('fitGrowGuestBackup',JSON.stringify(localData()));const local=Array.isArray(localData().activities)?localData().activities:[];const flag=`fitGrowImported_${currentUser.id}`;if(local.length&&localStorage.getItem(flag)!=='yes'){const doImport=confirm(`Auf diesem Gerät liegen ${local.length} lokale Aktivitäten. Sollen sie in das Konto ${currentUser.email} übertragen werden? Nur bestätigen, wenn sie zu diesem Konto gehören.`);if(doImport){await uploadLocalActivities();localStorage.setItem(flag,'yes');}}const remote=await loadCloudActivities();const merged=localStorage.getItem(flag)==='yes'?mergeActivities(local,remote):remote;if(window.fitGrowSetActivities)window.fitGrowSetActivities(merged);initialSyncComplete=true;status('Angemeldet – Aktivitäten sind mit deinem Konto synchronisiert.');}else{await uploadLocalActivities();status('Aktivitäten mit der Cloud synchronisiert.');if(currentUser)await loadGroups();}}catch(e){status(`Aktivitätssynchronisierung fehlgeschlagen: ${e.message||e}`,true);}finally{syncing=false;if(syncQueued){syncQueued=false;setTimeout(()=>syncActivities(false),250);}}}
  async function syncCustomActivities(){if(!currentUser)return;const items=(localData().customActivities||[]).map(a=>({user_id:currentUser.id,name:String(a.name||'').trim(),input_mode:a.input_mode||'duration'})).filter(a=>a.name);if(items.length){const {error}=await client.from('custom_activity_types').upsert(items,{onConflict:'user_id,name'});if(error)throw error;}}
  async function loadCustomActivities(){if(!currentUser)return;const {data,error}=await client.from('custom_activity_types').select('name,input_mode').eq('user_id',currentUser.id).order('name');if(error)throw error;if(window.fitGrowSetCustomActivities)window.fitGrowSetCustomActivities(data||[]);}
  async function loadPlantCatalog(){if(!currentUser)return;const {data,error}=await client.from('plant_species').select('id,common_name,latin_name,category,description,tagline,image_path,rarity,challenge_only,unlock_activity_count,group_unlock_xp,growth_days,growth_xp_stage_2,growth_xp_stage_3,growth_xp_stage_4,growth_xp_stage_5,sort_order').eq('is_active',true).order('sort_order');if(error)throw error;plantCatalogCache=data||[];if(window.fitGrowSetPlantCatalog)window.fitGrowSetPlantCatalog(plantCatalogCache);}

  async function syncGarden(){if(!currentUser)return;const {data:garden,error:gError}=await client.from('gardens').select('id').eq('owner_id',currentUser.id).is('group_id',null).limit(1).maybeSingle();if(gError)throw gError;let gardenId=garden?.id;if(!gardenId){const {data:newGarden,error}=await client.from('gardens').insert({owner_id:currentUser.id,name:'Mein Garten',group_id:null,garden_type:'personal'}).select('id').single();if(error)throw error;gardenId=newGarden.id;}const app=localData();const names=[...new Set(app.plants||[])];const progress=app.plantProgress||{};const thresholds=[0,15,40,80,130];for(const plantName of names){const xp=Math.max(0,Number(progress[plantName]?.xp)||0);let stage=1;for(let i=1;i<thresholds.length;i++){if(xp>=thresholds[i])stage=i+1;else break;}const {data:existing,error:checkError}=await client.from('garden_plants').select('id,growth_xp').eq('garden_id',gardenId).eq('plant_name',plantName).limit(1).maybeSingle();if(checkError)throw checkError;const growthXp=Math.max(xp,Number(existing?.growth_xp)||0);let growthStage=1;for(let i=1;i<thresholds.length;i++){if(growthXp>=thresholds[i])growthStage=i+1;else break;}if(!existing){const {error}=await client.from('garden_plants').insert({garden_id:gardenId,plant_name:plantName,plant_type:'activity_unlock',growth_stage:growthStage,growth_xp:growthXp});if(error)throw error;}else{const {error}=await client.from('garden_plants').update({growth_stage:growthStage,growth_xp:growthXp}).eq('id',existing.id);if(error)throw error;}}}
  async function loadGardenPlants(){if(!currentUser)return;const {data:g,error:gError}=await client.from('gardens').select('id').eq('owner_id',currentUser.id).is('group_id',null);if(gError)throw gError;const ids=(g||[]).map(x=>x.id);if(!ids.length)return;const {data,error}=await client.from('garden_plants').select('plant_name,growth_stage,growth_xp').in('garden_id',ids);if(error)throw error;if(window.fitGrowSetPlants)window.fitGrowSetPlants(data||[]);}
  function nameFor(map,id){const p=map.get(id);return p?.display_name||p?.username||'Unbekannter Nutzer';}
  async function getFriendProfiles(){if(!currentUser)return[];const uid=currentUser.id;const {data,error}=await client.from('friendships').select('user_id,friend_id').or(`user_id.eq.${uid},friend_id.eq.${uid}`);if(error)throw error;const ids=[...new Set((data||[]).map(r=>r.user_id===uid?r.friend_id:r.user_id))];if(!ids.length){friendsCache=[];return[];}const {data:profiles,error:pError}=await client.from('profiles').select('id,username,display_name').in('id',ids);if(pError)throw pError;friendsCache=profiles||[];return friendsCache;}
  async function loadFriends(){
    if(!currentUser)return;
    const uid=currentUser.id;
    const [friendResult,requestResult]=await Promise.all([
      client.from('friendships').select('id,user_id,friend_id').or(`user_id.eq.${uid},friend_id.eq.${uid}`),
      client.from('friend_requests').select('id,sender_id,receiver_id,status,created_at').or(`sender_id.eq.${uid},receiver_id.eq.${uid}`)
    ]);
    if(friendResult.error)throw friendResult.error;
    if(requestResult.error)throw requestResult.error;
    const friendships=friendResult.data||[];
    const friendIds=[...new Set(friendships.map(r=>r.user_id===uid?r.friend_id:r.user_id))];
    const requests=requestResult.data||[];
    const incoming=requests.filter(r=>r.receiver_id===uid&&r.status==='pending');
    const outgoing=requests.filter(r=>r.sender_id===uid&&r.status==='pending');
    const requestIds=requests.map(r=>r.sender_id===uid?r.receiver_id:r.sender_id);
    const visibleIds=[...new Set([...friendIds,...requestIds])];
    const {data:profiles,error:pError}=visibleIds.length
      ?await client.from('profiles').select('id,username,display_name').in('id',visibleIds)
      :{data:[],error:null};
    if(pError)throw pError;
    const profileMap=new Map((profiles||[]).map(p=>[p.id,p]));
    friendsCache=friendIds.map(id=>profileMap.get(id)).filter(Boolean);

    $('incomingRequests').innerHTML=incoming.map(r=>
      `<div class="challenge"><b>${escapeHtml(nameFor(profileMap,r.sender_id))}</b> möchte mit dir befreundet sein.<div class="actions"><button class="sm" onclick="fitGrowAccept('${r.id}')">Annehmen</button><button class="sm alt" onclick="fitGrowDecline('${r.id}')">Ablehnen</button></div></div>`
    ).join('')||'<div class="empty">Keine neuen Anfragen.</div>';
    $('outgoingRequests').innerHTML=outgoing.map(r=>
      `<div class="entry"><div><strong>Anfrage an ${escapeHtml(nameFor(profileMap,r.receiver_id))}</strong><small>Wartet auf Annahme</small></div><button class="sm alt" onclick="fitGrowCancel('${r.id}')">Zurückziehen</button></div>`
    ).join('')||'<div class="empty">Keine offenen gesendeten Anfragen.</div>';
    $('friendsList').innerHTML=friendsCache.map(p=>
      `<div class="entry"><div><strong>👤 ${escapeHtml(nameFor(profileMap,p.id))}</strong><small>@${escapeHtml(p.username||'')}</small></div><span class="badge">Freund</span></div>`
    ).join('')||'<div class="empty">Noch keine Freunde – suche jemanden über den Benutzernamen.</div>';

    if(!friendIds.length){
      $('friendActivityFeed').innerHTML='<div class="empty">Verbinde dich zuerst mit Freunden, um deren freigegebene Aktivitäten zu sehen.</div>';
    }else{
      const {data:feed,error:feedError}=await client.from('activities')
        .select('user_id,activity_type,repetitions,duration_minutes,distance_km,activity_date,xp,visibility')
        .in('user_id',friendIds).eq('visibility','friends')
        .order('activity_date',{ascending:false}).limit(30);
      if(feedError)throw feedError;
      $('friendActivityFeed').innerHTML=(feed||[]).map(a=>{
        const parts=[a.activity_date];
        if(a.repetitions)parts.push(`${a.repetitions} Wdh.`);
        if(a.duration_minutes)parts.push(`${a.duration_minutes} Min`);
        if(a.distance_km)parts.push(`${a.distance_km} km`);
        return `<div class="entry"><div><strong>${escapeHtml(nameFor(profileMap,a.user_id))} · ${escapeHtml(a.activity_type)}</strong><small>${escapeHtml(parts.join(' · '))}</small></div><span class="xp">+${Number(a.xp||0)} XP</span></div>`;
      }).join('')||'<div class="empty">Deine Freunde haben noch keine freigegebenen Aktivitäten eingetragen.</div>';
    }
    await loadGroups();
  }

  async function createActivityGroup(payload){
    if(!currentUser)throw new Error('Bitte zuerst anmelden.');
    const {data,error}=await client.rpc('create_activity_group',{
      p_name:payload.name,
      p_description:payload.description||null,
      p_invitee_ids:payload.invitee_ids||[]
    });
    if(error)throw error;
    return data;
  }

  async function respondGroupInvite(id,accept){
    const {error}=await client.rpc('respond_to_group_invite',{
      p_invite_id:id,
      p_accept:!!accept
    });
    if(error)throw error;
  }

  async function plantInSharedGarden(groupId,speciesId){
    const {data,error}=await client.rpc('plant_in_shared_garden',{p_group_id:groupId,p_species_id:speciesId});
    if(error)throw error;
    return data;
  }

  async function loadGroups(){
    if(!currentUser)return;
    const uid=currentUser.id;

    $('groupFriends').innerHTML=friendsCache.map(f=>
      `<label class="friendOption"><input type="checkbox" value="${f.id}"><span><b>${escapeHtml(f.display_name||f.username||'Freund')}</b><small>@${escapeHtml(f.username||'')}</small></span></label>`
    ).join('')||'<div class="empty">Du hast noch keine bestätigten Freunde. Füge zuerst Freunde hinzu.</div>';

    const {data:memberships,error:mError}=await client.from('group_members')
      .select('group_id,user_id,role').eq('user_id',uid);
    if(mError)throw mError;
    const ownGroupIds=[...new Set((memberships||[]).map(r=>r.group_id))];

    const {data:inviteRows,error:iError}=await client.from('group_invites')
      .select('id,group_id,sender_id,invitee_id,created_at')
      .eq('invitee_id',uid).eq('status','pending')
      .order('created_at',{ascending:false});
    if(iError)throw iError;
    const inviteGroupIds=(inviteRows||[]).map(r=>r.group_id);
    const allGroupIds=[...new Set([...ownGroupIds,...inviteGroupIds])];

    const {data:groupRows,error:gError}=allGroupIds.length
      ?await client.from('activity_groups').select('id,name,description,created_by,created_at').in('id',allGroupIds)
      :{data:[],error:null};
    if(gError)throw gError;
    const groupMap=new Map((groupRows||[]).map(g=>[g.id,g]));

    const {data:senderProfiles,error:sError}=(inviteRows||[]).length
      ?await client.from('profiles').select('id,username,display_name').in('id',[...new Set(inviteRows.map(r=>r.sender_id))])
      :{data:[],error:null};
    if(sError)throw sError;
    const senderMap=new Map((senderProfiles||[]).map(p=>[p.id,p]));
    $('groupInvites').innerHTML=(inviteRows||[]).map(inv=>{
      const g=groupMap.get(inv.group_id);
      const sender=senderMap.get(inv.sender_id);
      return `<div class="invite-card"><b>${escapeHtml(sender?.display_name||sender?.username||'Ein Freund')} lädt dich in „${escapeHtml(g?.name||'Gruppe')}“ ein.</b><p class="muted">${escapeHtml(g?.description||'Gemeinsamer Aktivitäten-Feed')}</p><div class="actions"><button class="sm" onclick="respondGroupInvite('${inv.id}',true)">Beitreten</button><button class="sm alt" onclick="respondGroupInvite('${inv.id}',false)">Ablehnen</button></div></div>`;
    }).join('')||'<div class="empty">Keine offenen Gruppeneinladungen.</div>';

    if(!ownGroupIds.length){
      $('groupsList').innerHTML='<div class="empty">Du bist noch in keiner Gruppe. Erstelle eine Gruppe und lade bestätigte Freunde ein.</div>';
      return;
    }

    const groupCards=[];
    for(const groupId of ownGroupIds){
      const group=groupMap.get(groupId);
      if(!group)continue;
      const {data:members,error:memberError}=await client.from('group_members')
        .select('user_id,role').eq('group_id',groupId);
      if(memberError)throw memberError;
      const memberIds=[...new Set((members||[]).map(m=>m.user_id))];
      const {data:memberProfiles,error:profileError}=memberIds.length
        ?await client.from('profiles').select('id,username,display_name').in('id',memberIds)
        :{data:[],error:null};
      if(profileError)throw profileError;
      const memberMap=new Map((memberProfiles||[]).map(p=>[p.id,p]));
      const memberNames=(members||[]).map(m=>m.user_id===uid?'Du':(memberMap.get(m.user_id)?.display_name||memberMap.get(m.user_id)?.username||'Mitglied'));

      // Read the members' original activity rows. No activity rows are copied to the group.
      const {data:activities,error:activityError}=memberIds.length
        ?await client.from('activities')
          .select('id,user_id,activity_type,repetitions,duration_minutes,distance_km,activity_date,xp,notes')
          .in('user_id',memberIds).eq('visibility','friends')
          .order('activity_date',{ascending:false}).limit(40)
        :{data:[],error:null};
      if(activityError)throw activityError;
      const feed=(activities||[]).map(a=>{
        const profile=memberMap.get(a.user_id);
        const person=a.user_id===uid?'Du':(profile?.display_name||profile?.username||'Mitglied');
        const values=[a.activity_date];
        if(a.repetitions)values.push(`${a.repetitions} Wdh.`);
        if(a.duration_minutes)values.push(`${a.duration_minutes} Min`);
        if(a.distance_km)values.push(`${Number(a.distance_km).toLocaleString('de-DE')} km`);
        if(a.notes)values.push(a.notes);
        return `<div class="entry"><div><strong>${escapeHtml(person)} · ${escapeHtml(a.activity_type)}</strong><small>${escapeHtml(values.join(' · '))}</small></div><span class="xp">+${Number(a.xp||0)} XP</span></div>`;
      }).join('')||'<div class="empty">Noch keine freigegebenen Aktivitäten in dieser Gruppe.</div>';
      const {data:sharedGarden,error:sgError}=await client.from('gardens')
        .select('id,name,level,xp').eq('group_id',groupId).maybeSingle();
      if(sgError)throw sgError;
      let sharedGardenMarkup='<div class="sharedGardenNote">Der gemeinsame Garten wird angelegt …</div>';
      if(sharedGarden){
        const {data:sharedPlants,error:spError}=await client.from('garden_plants')
          .select('id,plant_name,species_id,growth_stage,growth_xp').eq('garden_id',sharedGarden.id)
          .order('planted_at',{ascending:true});
        if(spError)throw spError;
        const speciesMap=new Map(plantCatalogCache.map(p=>[p.id,p]));
        const plantTiles=(sharedPlants||[]).map(row=>{
          const spec=speciesMap.get(row.species_id)||plantCatalogCache.find(p=>p.common_name===row.plant_name);
          const image=spec?.image_path||'garden-backdrop.webp';
          const stageLabels=['Keimling','Jungpflanze','Blattwachstum','Knospen / Frucht','Ausgewachsen'];
          const stage=Math.max(1,Math.min(5,Number(row.growth_stage)||1));
          const thresholds=spec?[spec.growth_xp_stage_2,spec.growth_xp_stage_3,spec.growth_xp_stage_4,spec.growth_xp_stage_5]:[15,40,80,130];
          const lower=stage===1?0:Number(thresholds[stage-2]||0);
          const upper=stage===5?lower:Number(thresholds[stage-1]||130);
          const pct=stage===5?100:Math.max(0,Math.min(100,Math.round((Number(row.growth_xp||0)-lower)/Math.max(1,upper-lower)*100)));
          const plantHeight=[42,52,64,78,92][stage-1];
          return `<div class="sharedGardenPlant"><img style="height:${plantHeight}px" src="./plants/${escapeHtml(image)}" alt="${escapeHtml(row.plant_name)}" loading="lazy"><b>${escapeHtml(row.plant_name)}</b><small>${escapeHtml(stageLabels[stage-1])}</small><div class="sharedGardenBar"><i style="width:${pct}%"></i></div></div>`;
        }).join('')||'<div class="sharedGardenNote">Noch keine Pflanzen. Setzt gemeinsam die ersten Samen!</div>';
        const plantedSpecies=new Set((sharedPlants||[]).map(p=>p.species_id).filter(Boolean));
        const eligible=plantCatalogCache.filter(p=>!p.challenge_only&&!plantedSpecies.has(p.id)&&Number(p.group_unlock_xp||0)<=Number(sharedGarden.xp||0));
        const locked=plantCatalogCache.filter(p=>!p.challenge_only&&!plantedSpecies.has(p.id)&&Number(p.group_unlock_xp||0)>Number(sharedGarden.xp||0));
        const options=eligible.map(p=>`<option value="${escapeHtml(p.id)}">${escapeHtml(p.common_name)}</option>`).join('');
        const lockedNote=locked.length?` Noch ${locked.length} weitere Arten werden mit Gruppen-XP freigeschaltet.`:'';
        sharedGardenMarkup=`<div class="sharedGarden"><div class="sharedGardenHead"><strong>🌿 Gemeinsamer Garten</strong><span class="sharedGardenStats">Level ${Number(sharedGarden.level||1)} · ${Number(sharedGarden.xp||0).toLocaleString('de-DE')} Gruppen-XP</span></div><div class="sharedGardenScene"><div class="sharedGardenPlants">${plantTiles}</div></div><div class="sharedGardenFooter"><select id="groupPlantSelect-${groupId}"><option value="">Pflanze für den Garten wählen …</option>${options}</select><button type="button" onclick="plantGroupGarden('${groupId}')" ${eligible.length?'':'disabled'}>＋ Pflanzen</button></div><div class="sharedGardenNote">Jede freigegebene Aktivität eines Gruppenmitglieds lässt alle vorhandenen Pflanzen wachsen. Neue Arten werden durch gemeinsame Gruppen-XP freigeschaltet.${lockedNote}</div></div>`;
      }
      groupCards.push(`<div class="challenge"><div class="challenge-head"><div><b>🌳 ${escapeHtml(group.name)}</b><p class="muted">${escapeHtml(group.description||'Gemeinsame Gruppe')} · ${members?.length||0} Mitglieder</p><small>${escapeHtml(memberNames.join(', '))}</small></div><span class="badge">Online</span></div>${sharedGardenMarkup}<h3>Aktivitäten der Gruppe</h3>${feed}</div>`);
    }
    $('groupsList').innerHTML=groupCards.join('')||'<div class="empty">Deine Gruppen konnten nicht angezeigt werden.</div>';
  }

  async function refreshSocialAndAdmin(){await loadProfile();await loadFriends();await loadAdminPanel();await syncCustomActivities();await loadCustomActivities();await loadPlantCatalog();await syncGarden();await loadGardenPlants();await loadGroups();}
  async function createFriendChallenge(p){const {data,error}=await client.rpc('create_friend_challenge',{p_title:p.title,p_description:p.description||null,p_activity_type:p.activity_type,p_metric:p.metric,p_start_date:p.start_date,p_end_date:p.end_date,p_comparison:'max',p_reward_plant_name:p.reward_plant_name,p_invitee_ids:p.invitee_ids});if(error)throw error;return data;}
  async function loadChallengeCenter(){if(!currentUser)throw new Error('Bitte anmelden.');const friends=await getFriendProfiles();const uid=currentUser.id;const {data:inviteRows,error:iError}=await client.from('challenge_invites').select('id,challenge_id,sender_id,invitee_id,status,created_at').eq('invitee_id',uid).eq('status','pending').order('created_at',{ascending:false});if(iError)throw iError;const inviteChallengeIds=[...new Set((inviteRows||[]).map(x=>x.challenge_id))];let inviteChallenges=[];let senderMap=new Map();if(inviteChallengeIds.length){const {data:c,error:cError}=await client.from('challenges').select('id,title,activity_type,metric,start_date,end_date,reward_plant_name,description').in('id',inviteChallengeIds);if(cError)throw cError;inviteChallenges=c||[];const senderIds=[...new Set(inviteRows.map(x=>x.sender_id))];const {data:senders,error:sError}=await client.from('profiles').select('id,username,display_name').in('id',senderIds);if(sError)throw sError;senderMap=new Map((senders||[]).map(p=>[p.id,p]));}
    const invites=(inviteRows||[]).map(r=>({id:r.id,sender_name:nameFor(senderMap,r.sender_id),challenge:inviteChallenges.find(c=>c.id===r.challenge_id)||{title:'Challenge'}}));
    const {data:memberships,error:mError}=await client.from('challenge_participants').select('challenge_id').eq('user_id',uid);if(mError)throw mError;const challengeIds=[...new Set((memberships||[]).map(x=>x.challenge_id))];let challenges=[];if(challengeIds.length){const {data:challengeRows,error:cError}=await client.from('challenges').select('id,title,description,activity_type,metric,comparison,start_date,end_date,reward_plant_name,creator_id').in('id',challengeIds).order('created_at',{ascending:false});if(cError)throw cError;for(const c of challengeRows||[]){const {data:leaderboard,error:lError}=await client.rpc('get_challenge_leaderboard',{p_challenge_id:c.id});if(lError)throw lError;let claimed=false;if(c.end_date&&c.end_date.slice(0,10)<new Date().toISOString().slice(0,10)&&c.reward_plant_name){const my=(leaderboard||[]).find(r=>r.user_id===uid);const max=Math.max(0,...(leaderboard||[]).map(r=>Number(r.score)||0));claimed=(localData().plants||[]).includes(c.reward_plant_name);}
       challenges.push({...c,leaderboard:leaderboard||[],reward_claimed:claimed});}}
    return {user_id:uid,friends,invites,challenges};}
  async function respondChallengeInvite(id,accept){let challenge=null;if(accept){const {data:inv,error:iError}=await client.from('challenge_invites').select('challenge_id').eq('id',id).single();if(iError)throw iError;const {data:c,error:cError}=await client.from('challenges').select('activity_type,metric').eq('id',inv.challenge_id).single();if(cError)throw cError;challenge=c;}const {error}=await client.rpc('respond_to_challenge_invite',{p_invite_id:id,p_accept:!!accept});if(error)throw error;if(accept&&challenge&&!(localData().customActivities||[]).some(a=>a.name===challenge.activity_type)){const builtIn=['Liegestütze','Klimmzüge','Workout','Gym','Yoga','Joggen','Schwimmen','Radfahren','Snowboarden','Wandern','Spaziergang','Sonstiges'];if(!builtIn.includes(challenge.activity_type)){const mode=challenge.metric==='repetitions'?'reps':challenge.metric==='distance_km'?'distance':'duration';const {error:customError}=await client.from('custom_activity_types').upsert({user_id:currentUser.id,name:challenge.activity_type,input_mode:mode},{onConflict:'user_id,name'});if(customError)throw customError;await loadCustomActivities();}}} 
  async function claimChallengeReward(id){const {data,error}=await client.rpc('claim_challenge_reward',{p_challenge_id:id});if(error)throw error;if(data)await loadGardenPlants();return !!data;}
  async function refreshAll(){try{await loadProfile();await loadFriends();await loadAdminPanel();await syncCustomActivities();await loadCustomActivities();await loadPlantCatalog();await syncGarden();await loadGardenPlants();await loadGroups();}catch(e){status(`Kontodaten konnten nicht vollständig geladen werden: ${e.message||e}`,true);}}
  async function initializeUser(user){if(!user)return;showLoginState(user);await syncActivities(true);await refreshAll();}
  async function handleAuthSession(user){const nextId=user?.id||null;showLoginState(user||null);if(nextId===activeUserId)return;activeUserId=nextId;initialSyncComplete=false;if(user){status('Konto wird geladen …');setTimeout(()=>initializeUser(user),0);}else{const backup=localStorage.getItem('fitGrowGuestBackup');if(backup&&window.fitGrowRestoreAppData){try{window.fitGrowRestoreAppData(JSON.parse(backup));}catch(_){}}status('Abgemeldet. Lokale Gerätedaten wurden wiederhergestellt.');}}
  async function authAction(mode){const email=$('authEmail').value.trim(),password=$('authPassword').value;if(!email||!password)return status('Bitte E-Mail und Passwort eingeben.',true);if(password.length<8)return status('Bitte ein Passwort mit mindestens 8 Zeichen verwenden.',true);status(mode==='signup'?'Registrierung läuft …':'Anmeldung läuft …');const result=mode==='signup'?await client.auth.signUp({email,password}):await client.auth.signInWithPassword({email,password});if(result.error)return status(result.error.message,true);if(mode==='signup'&&!result.data.session)return status('Registrierung angelegt. Bitte bestätige den Link in deiner E-Mail und melde dich danach an.');status(mode==='signup'?'Registrierung erfolgreich.':'Anmeldung erfolgreich.');}
  async function saveProfile(){if(!currentUser)return;const username=$('profileUsername').value.trim().toLowerCase(),displayName=$('profileDisplayName').value.trim();if(!/^[a-z0-9_]{3,30}$/.test(username))return status('Benutzername: 3–30 Zeichen, nur Kleinbuchstaben, Zahlen und Unterstriche.',true);const {error}=await client.from('profiles').upsert({id:currentUser.id,username,display_name:displayName||null},{onConflict:'id'});if(error)return status(error.message,true);status('Profil gespeichert.');await loadFriends();await loadAdminPanel();}
  async function addFriend(){if(!currentUser)return status('Bitte zuerst anmelden.',true);const username=$('friendUsername').value.trim().toLowerCase();if(!/^[a-z0-9_]{3,30}$/.test(username))return status('Bitte einen gültigen Benutzernamen mit mindestens 3 Zeichen eingeben.',true);if(username===$('profileUsername').value.trim().toLowerCase())return status('Du kannst dich nicht selbst hinzufügen.',true);const {data:found,error:searchError}=await client.rpc('search_users',{p_search:username});if(searchError)return status(searchError.message,true);const profile=(found||[]).find(p=>String(p.username).toLowerCase()===username);if(!profile)return status('Kein Nutzer mit diesem Benutzernamen gefunden.',true);const uid=currentUser.id;const [f,r]=await Promise.all([client.from('friendships').select('id').or(`and(user_id.eq.${uid},friend_id.eq.${profile.id}),and(user_id.eq.${profile.id},friend_id.eq.${uid})`),client.from('friend_requests').select('id,status').or(`and(sender_id.eq.${uid},receiver_id.eq.${profile.id}),and(sender_id.eq.${profile.id},receiver_id.eq.${uid})`)]);if(f.error)return status(f.error.message,true);if(r.error)return status(r.error.message,true);if((f.data||[]).length)return status('Ihr seid bereits befreundet.',true);if((r.data||[]).some(x=>x.status==='pending'))return status('Für diese Person besteht bereits eine offene Anfrage.',true);const {error}=await client.from('friend_requests').insert({sender_id:uid,receiver_id:profile.id,status:'pending'});if(error)return status(error.message,true);$('friendUsername').value='';status(`Freundschaftsanfrage an @${profile.username} gesendet.`);await loadFriends();}
  async function acceptRequest(id){const {error}=await client.rpc('accept_friend_request',{p_request_id:id});if(error)return status(error.message,true);status('Freundschaft angenommen.');await loadFriends();}
  async function declineRequest(id){const {error}=await client.rpc('decline_friend_request',{p_request_id:id});if(error)return status(error.message,true);status('Anfrage abgelehnt.');await loadFriends();}
  async function cancelRequest(id){const {error}=await client.rpc('cancel_friend_request',{p_request_id:id});if(error)return status(error.message,true);status('Anfrage zurückgezogen.');await loadFriends();}
  async function logout(){if(client){const {error}=await client.auth.signOut();if(error)status(error.message,true);}}
  window.fitGrowAccept=acceptRequest;window.fitGrowDecline=declineRequest;window.fitGrowCancel=cancelRequest;window.fitGrowRespondGroupInvite=respondGroupInvite;
  window.fitGrowCloudSyncActivities=()=>syncActivities(false);window.fitGrowCloudSyncCustomActivities=()=>syncCustomActivities();window.fitGrowCloudSyncGarden=()=>syncGarden();
  window.fitGrowOnline={createChallenge:createFriendChallenge,loadChallengeCenter,respondChallengeInvite,claimChallengeReward,getFriends:getFriendProfiles,getUserId:()=>currentUser?.id||null,createGroup:createActivityGroup,respondGroupInvite,plantInSharedGarden,refreshGroups:loadGroups};
  document.addEventListener('DOMContentLoaded',async()=>{
    if(!configured){status('Supabase ist noch nicht verbunden. Project URL und Publishable Key in config.js eintragen.',true);return;}
    if(!window.supabase?.createClient){status('Supabase-Bibliothek konnte nicht geladen werden. Internetverbindung prüfen.',true);return;}
    client=window.supabase.createClient(url,key,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
    $('btnSignup').addEventListener('click',()=>authAction('signup').catch(e=>status(e.message,true)));
    $('btnLogin').addEventListener('click',()=>authAction('login').catch(e=>status(e.message,true)));
    $('btnSaveProfile').addEventListener('click',()=>saveProfile().catch(e=>status(e.message,true)));
    $('btnAddFriend').addEventListener('click',()=>addFriend().catch(e=>status(e.message,true)));
    $('btnLogout').addEventListener('click',()=>logout().catch(e=>status(e.message,true)));
    const {data,error}=await client.auth.getSession();if(error)status(error.message,true);handleAuthSession(data?.session?.user||null);
    client.auth.onAuthStateChange((_event,session)=>setTimeout(()=>handleAuthSession(session?.user||null),0));
  });
})();
