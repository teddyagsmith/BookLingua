export const researchFields={
  opportunities:Array.from({length:12},(_,i)=>({name:`Opportunity ${i+1}`,url:`https://example.com/opportunity-${i+1}`,type:i<3?'reviewer_blog':'reader_community',audience:'French romantasy readers',fit:'Book-specific fit',cost:'Free',promotionAllowed:'Check current rules',contactRoute:'Public contact page',priority:(i<4?'High':i<8?'Medium':'Low') as 'High'|'Medium'|'Low'})),
  topOpportunities:Array.from({length:10},(_,i)=>({rank:i+1,opportunity:`Opportunity ${i+1}`,url:`https://example.com/opportunity-${i+1}`,whyItFits:'French romantasy fit',effort:'Low' as const,likelyCost:'Free',recommendedAction:'Verify rules and send a tailored pitch.'})),
  launchPlan30Day:{minimumViable:['Create listing'],pushHarder:['Recruit more ARC readers'],phases:['4 weeks before','2 weeks before','Launch week','Weeks 2–4'].map(timing=>({timing,actions:['Complete one focused action.']}))},
  marketingHooks:Array.from({length:5},(_,i)=>({hook:`Hook ${i+1}`,readerAppeal:'Specific reader appeal',frenchPromotionalLine:'Une promesse romantasy sombre.'})),
  socialContentIdeas:Array.from({length:8},(_,i)=>({concept:`Concept ${i+1}`,explanation:'Book-specific concept',frenchCaption:'Une légende française.',hashtags:['#BookTokFrance','#Romantasy'],format:'Reel'})),
  amazonAdsStrategy:{startingStrategy:'Start narrow.',comparableTargets:['Comparable'],targetingIdeas:['Category targeting'],metaPositioning:'Lead with the gothic fae-marriage hook.'},
  discountPromotion:[{option:'€0.99 launch',availability:'Available through list price change',restriction:'Confirm current retailer rules',recommendedAction:'Coordinate a 72-hour campaign.'}],
  research:{completedAt:'2026-08-14',sources:Array.from({length:10},(_,i)=>({name:`Source ${i+1}`,url:`https://example.com/source-${i+1}`,note:'Verified test source'}))},
}
