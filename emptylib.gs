include "core.gs"
include "online.gs"

class tttelib isclass Library
{
  OnlineAccess OA;
  TTTEOnline onlineLibrary;

  public void Init(Asset asset)
  {
    inherited(asset);
    onlineLibrary = cast<TTTEOnline>World.GetLibrary(asset.LookupKUIDTable("onlinelibrary"));
    
    //OA = GetOnlineAccess();
  }

  public TTTEOnline GetOnlineLibrary()
  {
    return onlineLibrary;
  }
};
